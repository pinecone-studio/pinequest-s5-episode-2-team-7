"""Case validation against the JSON Schema exported from the app (single source of truth).

The app's zod schema is authoritative; `npm run schema:export` writes
`data/schema/case.schema.json` and `data/schema/topics.json`. JSON Schema cannot
express every cross-field rule, so the semantic checks the app enforces are
re-implemented in `semantic_issues`.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .paths import CASES_DIR, SCHEMA_DIR

NARRATOR_KINDS = {"exam", "vital", "investigation"}
PATIENT_META_TOPICS = {"associated_general", "concerns"}


@lru_cache(maxsize=1)
def case_validator() -> Draft202012Validator:
    schema = json.loads((SCHEMA_DIR / "case.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema)


@lru_cache(maxsize=1)
def topics() -> dict[str, dict[str, Any]]:
    data = json.loads((SCHEMA_DIR / "topics.json").read_text(encoding="utf-8"))
    return {t["id"]: t for t in data}


def semantic_issues(case: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    topic_kinds = {tid: t["kind"] for tid, t in topics().items()}
    seen: set[str] = set()
    for i, fact in enumerate(case.get("hidden", {}).get("facts", [])):
        if fact["id"] in seen:
            issues.append(f"hidden.facts.{i}.id: duplicate fact id {fact['id']}")
        seen.add(fact["id"])
        narrator = fact["kind"] in NARRATOR_KINDS
        if narrator == fact["patientKnows"]:
            issues.append(f"hidden.facts.{i}.patientKnows: inconsistent with kind {fact['kind']}")
        for tid in fact["topics"]:
            kind = topic_kinds.get(tid)
            if narrator and kind != "exam":
                issues.append(f"hidden.facts.{i}.topics: narrator fact linked to non-exam topic {tid}")
            if not narrator and (kind == "exam" or (kind == "meta" and tid not in PATIENT_META_TOPICS)):
                issues.append(f"hidden.facts.{i}.topics: patient fact linked to topic {tid}")
    rubric = case.get("rubric", {})
    items = rubric.get("items", [])
    if not any(item.get("critical") for item in items):
        issues.append("rubric.items: needs at least one critical item")
    weights = rubric.get("weights")
    if weights and abs(sum(weights.values()) - 1) > 1e-6:
        issues.append("rubric.weights: must sum to 1")
    diagnosis = case.get("hidden", {}).get("diagnosis", {})
    aliases = [a.lower() for a in diagnosis.get("acceptedAliases", []) + [diagnosis.get("label", {}).get("mn", "")] if len(a) >= 3]
    public = case.get("public", {})
    public_text = " ".join(
        [case.get("id", "").replace("-", " ").replace("_", " "), public.get("displayTitle", {}).get("mn", ""), public.get("openingLine", {}).get("mn", "")]
    ).lower()
    for alias in aliases:
        if alias in public_text:
            issues.append(f"public: diagnosis '{alias}' is visible to students")
    return issues


def validate_case(case: dict[str, Any]) -> list[str]:
    """Return a list of human-readable problems (empty when valid)."""
    errors = [f"{'.'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}" for e in case_validator().iter_errors(case)]
    if errors:
        return errors
    return semantic_issues(case)


def with_defaults(case: dict[str, Any]) -> dict[str, Any]:
    """Apply the zod defaults the app relies on (fact.leakTerms, volunteerOnBroad...)."""
    case = json.loads(json.dumps(case))
    for fact in case["hidden"]["facts"]:
        fact.setdefault("leakTerms", [])
        fact.setdefault("volunteerOnBroad", False)
    case["hidden"].setdefault("differentials", [])
    case["hidden"].setdefault("investigationsAvailable", False)
    case["public"].setdefault("tags", [])
    case.setdefault("version", 1)
    return case


def load_cases(directory: Path = CASES_DIR) -> list[dict[str, Any]]:
    cases = []
    for path in sorted(directory.glob("*.json")):
        cases.append(json.loads(path.read_text(encoding="utf-8")))
    return cases
