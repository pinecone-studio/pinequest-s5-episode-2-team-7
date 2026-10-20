"""Train/serve parity: Python must reproduce the app's planner, context, prompt and template reply."""

import json
from pathlib import Path

import pytest

from pinequest_ml.prompt import PROMPT_FORMAT_VERSION, build_context, mock_reply, plan_turn, render_prompt
from pinequest_ml.schema import load_cases, validate_case, with_defaults

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "prompt_golden.json").read_text(encoding="utf-8"))
CASES = {c["id"]: with_defaults(c) for c in load_cases()}


def test_format_version_matches_app():
    assert FIXTURES["formatVersion"] == PROMPT_FORMAT_VERSION


def test_demo_cases_are_valid():
    for case in load_cases():
        assert validate_case(case) == [], case["id"]


@pytest.mark.parametrize("fixture", FIXTURES["fixtures"], ids=lambda f: f"{f['caseId']}:{f['input']['question'][:20]}")
def test_parity(fixture):
    case = CASES[fixture["caseId"]]
    inp = fixture["input"]
    disclosed = set(inp["alreadySharedFactIds"])
    plan = plan_turn(case, inp["topics"], disclosed)
    assert plan.mode == inp["mode"]
    assert [f["id"] for f in plan.facts] == inp["factIds"]
    assert plan.repeated_fact_ids == inp["repeatedFactIds"]
    assert plan.absent_topics == inp["absentTopics"]
    assert plan.unknown_topics == inp["unknownTopics"]
    assert plan.overflow == inp["overflow"]

    ctx = build_context(case, plan, inp["question"], disclosed, inp["history"])
    assert ctx == fixture["expected"]["context"]
    assert render_prompt(ctx) == fixture["expected"]["prompt"]
    assert mock_reply(ctx) == fixture["expected"]["mockReply"]
