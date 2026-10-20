"""Evaluate a patient model on held-out examples.

Backends:
  --endpoint URL     any OpenAI-compatible server (our inference service, vLLM, Ollama)
  --base-model ID    local transformers model, optionally with --adapter DIR
  --reference        score the reference answers (sanity check of the metrics)

Metrics (per example, aggregated overall and by turn mode):
  diagnosis_leak     reply names the hidden diagnosis / an accepted alias
  undisclosed_leak   reply contains a leak term of a fact not in the prompt
  negation_ok        absent-symptom turns contain a negation
  mongolian          ≥60% of letters are Cyrillic
  chrf               character n-gram F-score vs the reviewed reference (faithfulness proxy)
  length_ok          ≤ 600 characters

Use the same command on base models (zero-shot, same prompt) to choose a base
model before fine-tuning, and on the fine-tuned adapter afterwards.
"""

from __future__ import annotations

import json
import time
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

from .paths import CASES_DIR, INTERIM_DIR
from .schema import load_cases, with_defaults

NEGATION_MARKERS = ("үгүй", "байхгүй", "гүй", "алга", "биш")


def chrf(hypothesis: str, reference: str, n: int = 6, beta: float = 2.0) -> float:
    def grams(text: str, k: int) -> dict[str, int]:
        text = text.replace(" ", "")
        out: dict[str, int] = defaultdict(int)
        for i in range(len(text) - k + 1):
            out[text[i : i + k]] += 1
        return out

    precisions, recalls = [], []
    for k in range(1, n + 1):
        h, r = grams(hypothesis, k), grams(reference, k)
        if not h or not r:
            continue
        overlap = sum(min(c, r.get(g, 0)) for g, c in h.items())
        precisions.append(overlap / sum(h.values()))
        recalls.append(overlap / sum(r.values()))
    if not precisions:
        return 0.0
    p, r = sum(precisions) / len(precisions), sum(recalls) / len(recalls)
    if p + r == 0:
        return 0.0
    return (1 + beta**2) * p * r / (beta**2 * p + r)


def _cyrillic_ratio(text: str) -> float:
    letters = [c for c in text if c.isalpha()]
    return sum(1 for c in letters if "Ѐ" <= c <= "ӿ") / len(letters) if letters else 0.0


def score(example: dict[str, Any], reply: str, case: dict[str, Any] | None) -> dict[str, Any]:
    system = example["messages"][0]["content"].lower()
    lowered = reply.lower()
    result: dict[str, Any] = {
        "mongolian": _cyrillic_ratio(reply) >= 0.6,
        "length_ok": len(reply) <= 600,
        "chrf": chrf(reply, example["messages"][-1]["content"]),
    }
    if case:
        terms = [case["hidden"]["diagnosis"]["label"]["mn"], *case["hidden"]["diagnosis"]["acceptedAliases"]]
        result["diagnosis_leak"] = any(len(t) > 3 and t.lower() in lowered and t.lower() not in system for t in terms)
        leaked = []
        for fact in case["hidden"]["facts"]:
            if fact["answer"]["mn"].lower() in system:
                continue
            leaked += [t for t in fact.get("leakTerms", []) if t.lower() in lowered and t.lower() not in system]
        result["undisclosed_leak"] = bool(leaked)
    if "- ҮГҮЙ:" in example["messages"][0]["content"] and example["mode"] == "answer" and "ЗӨВШӨӨРСӨН" in example["messages"][0]["content"]:
        allowed = example["messages"][0]["content"].split("## ЗӨВШӨӨРСӨН мэдээлэл (энэ хариултад)")[1].split("##")[0]
        if all(line.startswith("- ҮГҮЙ:") or not line.strip() for line in allowed.strip().splitlines()):
            result["negation_ok"] = any(m in lowered for m in NEGATION_MARKERS)
    return result


class EndpointBackend:
    def __init__(self, base_url: str, model: str, api_key: str | None):
        self.base_url, self.model, self.api_key = base_url.rstrip("/"), model, api_key

    def generate(self, messages: list[dict[str, str]]) -> str:
        body = json.dumps({"model": self.model, "messages": messages, "max_tokens": 200, "temperature": 0}).encode()
        headers = {"content-type": "application/json", **({"authorization": f"Bearer {self.api_key}"} if self.api_key else {})}
        request = urllib.request.Request(f"{self.base_url}/chat/completions", data=body, headers=headers)
        with urllib.request.urlopen(request, timeout=120) as response:
            data = json.loads(response.read())
        return (data["choices"][0]["message"]["content"] or "").strip()


class LocalBackend:
    def __init__(self, base_model: str, adapter: str | None, template_kwargs: dict[str, Any] | None = None):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(adapter or base_model)
        device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
        dtype = torch.float16 if device == "cuda" else torch.float32
        model = AutoModelForCausalLM.from_pretrained(base_model, torch_dtype=dtype).to(device)
        if adapter:
            from peft import PeftModel

            model = PeftModel.from_pretrained(model, adapter)
        self.model, self.device = model.eval(), device
        self.template_kwargs = template_kwargs or {}

    def generate(self, messages: list[dict[str, str]]) -> str:
        from .chat_format import format_prompt

        text = format_prompt(self.tokenizer, messages, self.template_kwargs)
        inputs = self.tokenizer(text, return_tensors="pt", add_special_tokens=False).to(self.device)
        with self.torch.no_grad():
            out = self.model.generate(**inputs, max_new_tokens=160, do_sample=False, pad_token_id=self.tokenizer.pad_token_id or self.tokenizer.eos_token_id)
        return self.tokenizer.decode(out[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True).strip()


def evaluate(args: Any) -> dict[str, Any]:
    rows = [json.loads(l) for l in Path(args.split).read_text(encoding="utf-8").splitlines() if l.strip()]
    if args.limit:
        rows = rows[: args.limit]
    cases = {c["id"]: with_defaults(c) for d in (CASES_DIR, INTERIM_DIR / "translated") if d.exists() for c in load_cases(d)}

    if args.reference:
        backend, label = None, "reference"
    elif args.endpoint:
        backend, label = EndpointBackend(args.endpoint, args.model, args.api_key), f"endpoint:{args.model}"
    elif args.base_model:
        template_kwargs = {}
        if args.adapter and (Path(args.adapter) / "pinequest_adapter.json").exists():
            template_kwargs = json.loads((Path(args.adapter) / "pinequest_adapter.json").read_text())["chat_template_kwargs"]
        backend, label = LocalBackend(args.base_model, args.adapter, template_kwargs), f"local:{args.base_model}{'+' + args.adapter if args.adapter else ''}"
    else:
        raise SystemExit("Choose --endpoint, --base-model or --reference")

    results, started = [], time.time()
    for i, row in enumerate(rows):
        reply = row["messages"][-1]["content"] if backend is None else backend.generate(row["messages"][:-1])
        s = score(row, reply, cases.get(row["case_id"]))
        results.append({"id": row["id"], "case_id": row["case_id"], "mode": row["mode"], "reply": reply, "reference": row["messages"][-1]["content"], **s})
        if (i + 1) % 25 == 0:
            print(f"  {i + 1}/{len(rows)}")

    def aggregate(items: list[dict[str, Any]]) -> dict[str, Any]:
        agg: dict[str, Any] = {"n": len(items)}
        for key in ("diagnosis_leak", "undisclosed_leak", "negation_ok", "mongolian", "length_ok"):
            vals = [r[key] for r in items if key in r]
            if vals:
                agg[f"{key}_rate"] = round(sum(vals) / len(vals), 4)
        agg["chrf_mean"] = round(sum(r["chrf"] for r in items) / max(1, len(items)), 4)
        return agg

    by_mode: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in results:
        by_mode[r["mode"]].append(r)
    summary = {"model": label, "split": str(args.split), "seconds": round(time.time() - started, 1), "overall": aggregate(results), "by_mode": {m: aggregate(v) for m, v in sorted(by_mode.items())}}

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stem = label.replace("/", "_").replace(":", "_").replace("+", "_")[:80]
    (out / f"{stem}.summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    with (out / f"{stem}.details.jsonl").open("w", encoding="utf-8") as fh:
        for r in results:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(json.dumps(summary["overall"], indent=2))
    return summary
