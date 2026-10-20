"""Build the instruction-tuning dataset with case-level splits and a quality report."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .dialogues import DialogueConfig, example_hash, examples_from_session, synthesize_case
from .paths import CASES_DIR, INTERIM_DIR, PROCESSED_DIR
from .prompt import PROMPT_FORMAT_VERSION
from .schema import load_cases, validate_case, with_defaults


def assign_split(case_id: str, ratios: dict[str, float], salt: str) -> str:
    """Deterministic split by CASE so no case appears in two splits (no leakage)."""
    bucket = int(hashlib.sha256(f"{salt}:{case_id}".encode()).hexdigest(), 16) % 10_000 / 10_000
    acc = 0.0
    for name in ("train", "validation", "test"):
        acc += ratios[name]
        if bucket < acc:
            return name
    return "train"


def build(config_path: Path, sessions_path: Path | None = None, out_dir: Path = PROCESSED_DIR) -> dict[str, Any]:
    cfg = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    dialogue_cfg = DialogueConfig(**cfg.get("dialogues", {}))
    ratios = cfg["split"]["ratios"]
    salt = str(cfg["split"].get("salt", "pinequest"))
    seeds = cfg.get("seeds", [0])
    overrides: dict[str, str] = cfg["split"].get("overrides", {})

    case_dirs = [CASES_DIR] + [Path(p) for p in cfg.get("extra_case_dirs", [])]
    if (INTERIM_DIR / "translated").exists():
        case_dirs.append(INTERIM_DIR / "translated")

    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "prompt_format": PROMPT_FORMAT_VERSION,
        "config": cfg,
        "cases": [],
        "invalid_cases": [],
        "excluded_cases": [],
        "warnings": [],
    }
    accepted: dict[str, dict[str, Any]] = {}
    for directory in case_dirs:
        for raw in load_cases(directory):
            cid = raw.get("id", "?")
            problems = validate_case(raw)
            if problems:
                report["invalid_cases"].append({"id": cid, "source_dir": str(directory), "problems": problems[:20]})
                continue
            prov = raw["provenance"]
            reasons = []
            if not prov["trainingUseAllowed"]:
                reasons.append("trainingUseAllowed=false")
            if cfg.get("require_clinical_review") and prov["clinicalReview"]["status"] != "reviewed":
                reasons.append("clinical review required")
            if cfg.get("require_translation_review") and prov["translation"]["status"] not in ("original", "human_reviewed"):
                reasons.append("translation review required")
            if reasons:
                report["excluded_cases"].append({"id": cid, "reasons": reasons})
                continue
            if cid in accepted:
                report["warnings"].append(f"duplicate case id {cid} in {directory} ignored")
                continue
            accepted[cid] = with_defaults(raw)

    splits: dict[str, list[dict[str, Any]]] = {"train": [], "validation": [], "test": []}
    case_split = {cid: overrides.get(cid) or assign_split(cid, ratios, salt) for cid in accepted}
    seen_hashes: set[str] = set()
    duplicates = 0

    def add(example: dict[str, Any]) -> None:
        nonlocal duplicates
        h = example_hash(example)
        if h in seen_hashes:
            duplicates += 1
            return
        seen_hashes.add(h)
        example["id"] = h[:16]
        splits[case_split[example["case_id"]]].append(example)

    for cid, case in accepted.items():
        for seed in seeds:
            for example in synthesize_case(case, dialogue_cfg, seed):
                add(example)
        prov = case["provenance"]
        report["cases"].append(
            {
                "id": cid,
                "split": case_split[cid],
                "source": prov["source"],
                "license": prov["license"],
                "synthetic": prov["synthetic"],
                "clinical_review": prov["clinicalReview"]["status"],
                "translation": prov["translation"]["status"],
                "missing_english": sum(1 for f in case["hidden"]["facts"] if not f["answer"].get("en")),
            }
        )

    if sessions_path:
        for line in sessions_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            record = json.loads(line)
            cid = record["caseId"]
            if cid not in accepted:
                report["warnings"].append(f"session {record['id']}: case {cid} not accepted for training, skipped")
                continue
            case = with_defaults(record["case"]) if record.get("case") else accepted[cid]
            examples, warnings = examples_from_session(record, case)
            report["warnings"].extend(warnings)
            for example in examples:
                add(example)

    out_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in splits.items():
        with (out_dir / f"{name}.jsonl").open("w", encoding="utf-8") as fh:
            for row in rows:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    all_rows = [r for rows in splits.values() for r in rows]
    report["dialogue_config"] = asdict(dialogue_cfg)
    report["counts"] = {
        "cases_accepted": len(accepted),
        "examples": {k: len(v) for k, v in splits.items()},
        "cases_per_split": dict(Counter(case_split.values())),
        "duplicates_removed": duplicates,
        "modes": dict(Counter(r["mode"] for r in all_rows)),
        "sources": dict(Counter(r["source"] for r in all_rows)),
        "language": {"mn_targets": sum(1 for r in all_rows if _cyrillic_ratio(r["messages"][-1]["content"]) >= 0.6), "total": len(all_rows)},
    }
    leakage = set().union(*[{r["case_id"] for r in splits[s]} for s in ("validation", "test")]) & {r["case_id"] for r in splits["train"]}
    report["case_leakage_across_splits"] = sorted(leakage)
    if len(accepted) < 10:
        report["warnings"].append(
            f"Only {len(accepted)} cases accepted — fine for a pipeline demonstration, far too few for a useful model. "
            "Validation/test metrics on so few cases are not meaningful."
        )
    (out_dir / "quality_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "quality_report.md").write_text(render_report(report), encoding="utf-8")
    return report


def _cyrillic_ratio(text: str) -> float:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if "Ѐ" <= c <= "ӿ") / len(letters)


def render_report(r: dict[str, Any]) -> str:
    c = r["counts"]
    lines = [
        "# Dataset quality report",
        "",
        f"- Generated: {r['generated_at']}",
        f"- Prompt format: `{r['prompt_format']}`",
        f"- Cases accepted: **{c['cases_accepted']}** · invalid: {len(r['invalid_cases'])} · excluded: {len(r['excluded_cases'])}",
        f"- Examples: train {c['examples']['train']} · validation {c['examples']['validation']} · test {c['examples']['test']}",
        f"- Duplicates removed: {c['duplicates_removed']}",
        f"- Mongolian targets: {c['language']['mn_targets']}/{c['language']['total']}",
        f"- Case leakage across splits: {', '.join(r['case_leakage_across_splits']) or 'none'}",
        "",
        "## Turn modes",
        "",
        *[f"- {k}: {v}" for k, v in sorted(c["modes"].items())],
        "",
        "## Cases",
        "",
        "| case | split | source | license | synthetic | clinical review | translation | facts without English |",
        "|---|---|---|---|---|---|---|---|",
        *[
            f"| {x['id']} | {x['split']} | {x['source']} | {x['license']} | {x['synthetic']} | {x['clinical_review']} | {x['translation']} | {x['missing_english']} |"
            for x in r["cases"]
        ],
    ]
    if r["invalid_cases"]:
        lines += ["", "## Invalid cases", ""]
        for x in r["invalid_cases"]:
            lines.append(f"- **{x['id']}** ({x['source_dir']}): " + "; ".join(x["problems"][:5]))
    if r["excluded_cases"]:
        lines += ["", "## Excluded cases", ""] + [f"- {x['id']}: {', '.join(x['reasons'])}" for x in r["excluded_cases"]]
    if r["warnings"]:
        lines += ["", "## Warnings", ""] + [f"- {w}" for w in r["warnings"]]
    return "\n".join(lines) + "\n"
