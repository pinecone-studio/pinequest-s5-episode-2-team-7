"""Synthesise multi-turn training interviews from approved structured cases.

Every example is ONE patient turn: the model input is exactly what the app
sends at inference time (restricted system prompt + conversation so far) and
the target is the reviewed case wording selected by the disclosure planner.
This teaches the model to:
  * answer only what was asked, from the allowed facts
  * deny absent symptoms consistently, admit not knowing uncovered history
  * keep repeated answers consistent, deflect diagnosis requests/injection
  * give limited answers to broad questions
"""

from __future__ import annotations

import hashlib
import json
import random
from dataclasses import dataclass
from typing import Any

from .paths import QUESTION_BANK
from .prompt import build_context, mock_reply, plan_turn, render_prompt
from .schema import topics

META_TOPICS = ["broad", "associated_general", "diagnosis_request", "injection", "greeting", "identity"]
CLARIFY_QUESTIONS = ["ммм...", "Тэр юу вэ?", "Аан, за.", "Ойлгосонгүй ээ"]


@dataclass
class DialogueConfig:
    dialogues_per_case: int = 30
    min_turns: int = 6
    max_turns: int = 14
    # Probabilities for choosing the next question type.
    p_case_topic: float = 0.6
    p_absent_symptom: float = 0.15
    p_unknown_history: float = 0.05
    p_meta: float = 0.12
    p_repeat: float = 0.05
    p_clarify: float = 0.03


def load_bank() -> dict[str, list[dict[str, Any]]]:
    return json.loads(QUESTION_BANK.read_text(encoding="utf-8"))


def _questions_for(bank: dict[str, list[dict[str, Any]]], topic: str) -> list[dict[str, Any]]:
    # Only use paraphrases whose classified topics include the intended topic.
    return [q for q in bank.get(topic, []) if topic in q["topics"]]


def synthesize_case(case: dict[str, Any], cfg: DialogueConfig, seed: int) -> list[dict[str, Any]]:
    rng = random.Random(f"{case['id']}:{seed}")
    bank = load_bank()
    kinds = {tid: t["kind"] for tid, t in topics().items()}
    fact_topics = sorted({t for f in case["hidden"]["facts"] if f["patientKnows"] for t in f["topics"] if t in bank})
    covered = {t for f in case["hidden"]["facts"] for t in f["topics"]}
    absent = sorted(t for t, k in kinds.items() if k == "symptom" and t not in covered and t not in case["public"]["chiefComplaintTopics"] and t in bank)
    unknown = sorted(t for t, k in kinds.items() if k == "history" and t not in covered and t in bank)
    examples: list[dict[str, Any]] = []

    for d in range(cfg.dialogues_per_case):
        disclosed: set[str] = set()
        history: list[dict[str, str]] = []
        asked: list[dict[str, Any]] = []
        n_turns = rng.randint(cfg.min_turns, cfg.max_turns)
        for turn in range(n_turns):
            roll = rng.random()
            thresholds = [
                (cfg.p_case_topic, fact_topics),
                (cfg.p_absent_symptom, absent),
                (cfg.p_unknown_history, unknown),
                (cfg.p_meta, META_TOPICS),
            ]
            pool: list[str] | None = None
            acc = 0.0
            for p, candidates in thresholds:
                acc += p
                if roll < acc:
                    pool = candidates
                    break
            if pool is None and roll < acc + cfg.p_repeat and asked:
                q = rng.choice(asked)
            elif pool:
                topic = rng.choice(pool)
                options = _questions_for(bank, topic)
                if not options:
                    continue
                q = rng.choice(options)
            else:
                q = {"question": rng.choice(CLARIFY_QUESTIONS), "topics": []}

            plan = plan_turn(case, q["topics"], disclosed)
            ctx = build_context(case, plan, q["question"], disclosed, history)
            target = mock_reply(ctx)
            prompt = render_prompt(ctx)
            examples.append(
                {
                    "case_id": case["id"],
                    "dialogue": f"{case['id']}#syn{seed}-{d}",
                    "turn": turn,
                    "mode": plan.mode,
                    "topics": q["topics"],
                    "disclosed_fact_ids": plan.newly_disclosed_ids,
                    "source": "synthetic",
                    "messages": [{"role": "system", "content": prompt["system"]}, *prompt["messages"], {"role": "assistant", "content": target}],
                }
            )
            disclosed.update(plan.newly_disclosed_ids)
            history += [{"role": "student", "text": q["question"]}, {"role": "patient", "text": target}]
            asked.append(q)
    return examples


def examples_from_session(record: dict[str, Any], case: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    """Rebuild training examples from an admin-approved app transcript export."""
    examples, warnings = [], []
    disclosed: set[str] = set()
    history: list[dict[str, str]] = []
    for i, turn in enumerate(record["turns"]):
        plan = plan_turn(case, turn["topics"], disclosed)
        if turn.get("mode") and plan.mode != turn["mode"]:
            warnings.append(f"{record['id']} turn {i}: planner mode {plan.mode} != recorded {turn['mode']} (skipped)")
        else:
            ctx = build_context(case, plan, turn["question"], disclosed, history)
            prompt = render_prompt(ctx)
            examples.append(
                {
                    "case_id": case["id"],
                    "dialogue": f"{case['id']}#session-{record['id']}",
                    "turn": i,
                    "mode": plan.mode,
                    "topics": turn["topics"],
                    "disclosed_fact_ids": plan.newly_disclosed_ids,
                    "source": f"session:{turn.get('provider') or 'unknown'}",
                    "messages": [{"role": "system", "content": prompt["system"]}, *prompt["messages"], {"role": "assistant", "content": turn["answer"]}],
                }
            )
        disclosed.update(plan.newly_disclosed_ids)
        history += [{"role": "student", "text": turn["question"]}, {"role": "patient", "text": turn["answer"]}]
    return examples, warnings


def example_hash(example: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(example["messages"], ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
