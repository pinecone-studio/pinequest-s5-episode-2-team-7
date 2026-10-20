"""English → Mongolian translation workflow for adapted cases.

1. `translate-export`  : interim drafts → CSV worksheet (one row per text field)
                          columns: case_id, path, en, mn_machine, mn_reviewed, reviewer, note
2. `translate-machine` : optional first draft into `mn_machine` with Gemini (free
                          tier) using the medical glossary. Never use this for
                          restricted data (e.g. PhysioNet) — it sends text to Google.
3. Medical translators / clinicians fill `mn_reviewed` (+ reviewer).
4. `translate-import`  : writes canonical cases to ml/data/interim/translated/,
                          preferring `mn_reviewed`; translation.status becomes
                          `human_reviewed` only if EVERY field was reviewed.

English source, machine draft, reviewed text and review status stay separate.
"""

from __future__ import annotations

import csv
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterator

from .paths import GLOSSARY

COLUMNS = ["case_id", "path", "en", "mn_machine", "mn_reviewed", "reviewer", "note"]


def _walk(value: Any, path: str = "") -> Iterator[tuple[str, dict[str, str]]]:
    if isinstance(value, dict):
        if "en" in value and "mn" in value and isinstance(value.get("en"), str):
            yield path, value
            return
        for key, sub in value.items():
            yield from _walk(sub, f"{path}.{key}" if path else key)
    elif isinstance(value, list):
        for i, sub in enumerate(value):
            yield from _walk(sub, f"{path}.{i}")


def _set(case: dict[str, Any], path: str, mn: str) -> None:
    node: Any = case
    for part in path.split("."):
        node = node[int(part)] if isinstance(node, list) else node[part]
    node["mn"] = mn


def export_worksheet(draft_dir: Path, out_csv: Path) -> int:
    rows = 0
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        for path in sorted(draft_dir.glob("*.json")):
            case = json.loads(path.read_text(encoding="utf-8"))
            for field_path, text in _walk(case):
                if text.get("mn"):
                    continue
                writer.writerow({"case_id": case["id"], "path": field_path, "en": text["en"], "mn_machine": "", "mn_reviewed": "", "reviewer": "", "note": ""})
                rows += 1
    return rows


def load_glossary() -> list[tuple[str, str]]:
    if not GLOSSARY.exists():
        return []
    with GLOSSARY.open(encoding="utf-8") as fh:
        return [(r["en"], r["mn"]) for r in csv.DictReader(fh)]


def _gemini(text: str, glossary: list[tuple[str, str]], api_key: str, model: str) -> str:
    terms = "\n".join(f"- {en} → {mn}" for en, mn in glossary if en.lower() in text.lower())
    instruction = (
        "Translate this medical case text from English into natural Mongolian (Cyrillic). "
        "If it is something a patient says, use plain colloquial patient speech in the first person; "
        "otherwise use standard Mongolian medical terminology. Return only the translation."
        + (f"\nUse these glossary terms:\n{terms}" if terms else "")
    )
    body = json.dumps(
        {
            "systemInstruction": {"parts": [{"text": instruction}]},
            "contents": [{"role": "user", "parts": [{"text": text}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 800},
        }
    ).encode()
    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=body,
        headers={"content-type": "application/json", "x-goog-api-key": api_key},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.loads(response.read())
    return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"]).strip()


def machine_translate(csv_path: Path, model: str = "gemini-3.8-flash", delay_s: float = 4.5, limit: int | None = None) -> int:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("Set GEMINI_API_KEY to use machine translation (or fill mn_reviewed manually).")
    glossary = load_glossary()
    with csv_path.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    done = 0
    for row in rows:
        if row["mn_machine"] or row["mn_reviewed"]:
            continue
        if limit is not None and done >= limit:
            break
        try:
            row["mn_machine"] = _gemini(row["en"], glossary, api_key, model)
            done += 1
        except urllib.error.HTTPError as error:
            row["note"] = f"machine translation failed: HTTP {error.code}"
            if error.code == 429:
                break
        time.sleep(delay_s)  # stay under free-tier request limits
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return done


def import_worksheet(csv_path: Path, draft_dir: Path, out_dir: Path) -> list[Path]:
    with csv_path.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    by_case: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        by_case.setdefault(row["case_id"], []).append(row)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for path in sorted(draft_dir.glob("*.json")):
        case = json.loads(path.read_text(encoding="utf-8"))
        case_rows = by_case.get(case["id"], [])
        if not case_rows:
            continue
        reviewed_all = True
        reviewers: set[str] = set()
        for row in case_rows:
            text = row["mn_reviewed"].strip() or row["mn_machine"].strip()
            if not row["mn_reviewed"].strip():
                reviewed_all = False
            elif row["reviewer"].strip():
                reviewers.add(row["reviewer"].strip())
            if text:
                _set(case, row["path"], text)
        for fact in case["hidden"]["facts"]:
            fact.pop("_needsReview", None)
        case["provenance"]["translation"] = {
            "sourceLanguage": "en",
            "status": "human_reviewed" if reviewed_all and reviewers else "machine",
            "translator": "Gemini (machine draft)" if not reviewed_all else "human",
            **({"reviewer": ", ".join(sorted(reviewers))} if reviewers else {}),
        }
        target = out_dir / path.name
        target.write_text(json.dumps(case, ensure_ascii=False, indent=2), encoding="utf-8")
        written.append(target)
    return written
