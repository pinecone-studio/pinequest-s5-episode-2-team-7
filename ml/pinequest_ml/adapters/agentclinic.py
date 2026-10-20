"""AgentClinic OSCE cases → interim (English) canonical case drafts.

Source: https://github.com/SamuelSchmidgall/AgentClinic (repository licence: MIT,
verified 2026-10-20 via the GitHub API). Files: agentclinic_medqa(.extended).jsonl,
agentclinic_nejm(.extended).jsonl. The MedQA-derived cases come from USMLE-style
questions; the NEJM-derived cases are based on NEJM Image Challenge material —
treat NEJM content as NOT redistributable unless you confirm otherwise.

Record structure (verified on agentclinic_medqa.jsonl):
  OSCE_Examination.{Objective_for_Doctor, Patient_Actor{Demographics, History,
  Symptoms{Primary_Symptom, Secondary_Symptoms[]}, Past_Medical_History,
  Social_History, Review_of_Systems}, Physical_Examination_Findings{...},
  Test_Results{...}, Correct_Diagnosis}

Output: drafts with `mn` fields EMPTY. They are not valid canonical cases until
translated (`translate-export` / `translate-import`) and clinically reviewed.
`trainingUseAllowed` is false until a person confirms licensing.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .english_topics import guess_topics, split_sentences


def _t(en: str) -> dict[str, str]:
    return {"mn": "", "en": en.strip()}


def _flatten(prefix: str, value: Any) -> list[tuple[str, str]]:
    if isinstance(value, dict):
        out: list[tuple[str, str]] = []
        for key, sub in value.items():
            out += _flatten(f"{prefix} {key.replace('_', ' ')}".strip(), sub)
        return out
    if isinstance(value, list):
        return [(prefix, "; ".join(map(str, value)))]
    return [(prefix, str(value))]


def _demographics(text: str) -> tuple[int, str]:
    age_match = re.search(r"(\d{1,3})", text)
    sex = "female" if re.search(r"female|woman|girl", text, re.I) else "male"
    return (int(age_match.group(1)) if age_match else 40, sex)


def convert_record(record: dict[str, Any], index: int, source_file: str) -> dict[str, Any]:
    osce = record["OSCE_Examination"]
    actor = osce["Patient_Actor"]
    age, sex = _demographics(actor.get("Demographics", ""))
    primary = actor.get("Symptoms", {}).get("Primary_Symptom", "Feeling unwell")
    facts: list[dict[str, Any]] = []

    def add(fid: str, kind: str, en: str, topics: list[str], patient_knows: bool = True, volunteer: bool = False) -> None:
        if not en.strip() or not topics:
            return
        facts.append(
            {
                "id": f"{fid}-{len(facts)}",
                "kind": kind,
                "topics": topics,
                "patientKnows": patient_knows,
                "answer": _t(en),
                "leakTerms": [],
                "volunteerOnBroad": volunteer,
                "_needsReview": "topics guessed from English keywords",
            }
        )

    for i, sentence in enumerate(split_sentences(actor.get("History", ""))):
        add("hpi", "positive", sentence, guess_topics(sentence, default="associated_general"), volunteer=i == 0)
    for symptom in actor.get("Symptoms", {}).get("Secondary_Symptoms", []) or []:
        add("symptom", "positive", str(symptom), guess_topics(str(symptom), default="associated_general"))
    pmh = actor.get("Past_Medical_History", "")
    if pmh:
        add("pmh", "history", pmh, ["pmh", *[t for t in guess_topics(pmh) if t in ("hypertension", "diabetes", "hyperlipidemia", "surgeries", "medications")]][:3])
    for sentence in split_sentences(actor.get("Social_History", "")):
        add("social", "history", sentence, guess_topics(sentence, default="occupation"))
    ros = actor.get("Review_of_Systems", "")
    for sentence in split_sentences(ros):
        kind = "negative" if re.search(r"\b(denies|no |without)\b", sentence, re.I) else "positive"
        add("ros", kind, sentence, guess_topics(sentence, default="associated_general"))

    exam = osce.get("Physical_Examination_Findings", {})
    vitals = exam.get("Vital_Signs")
    if vitals:
        add("vitals", "vital", "; ".join(f"{k.replace('_', ' ')}: {v}" for k, v in vitals.items()), ["vitals", "physical_exam"], patient_knows=False)
    for path, value in _flatten("", {k: v for k, v in exam.items() if k != "Vital_Signs"}):
        add("exam", "exam", f"{path}: {value}", ["physical_exam"], patient_knows=False)
    for path, value in _flatten("", osce.get("Test_Results", {})):
        add("test", "investigation", f"{path}: {value}", ["investigations"], patient_knows=False)

    diagnosis = osce["Correct_Diagnosis"].strip()
    cc_topics = guess_topics(primary, default="associated_general")[:1]
    patient_topics = sorted({t for f in facts if f["patientKnows"] for t in f["topics"]} - {"associated_general"})
    rubric_items = [
        {
            "id": f"ask-{topic.replace('_', '-')}",
            "label": _t(f"Asked about {topic.replace('_', ' ')}"),
            "category": "hpi",
            "topics": [topic],
            "weight": 1,
            "critical": topic in cc_topics or topic == "onset",
            "rationale": _t("Auto-generated from source facts — REVIEW"),
            "suggestedQuestion": _t(f"Ask about {topic.replace('_', ' ')}."),
        }
        for topic in patient_topics
    ]
    if rubric_items and not any(i["critical"] for i in rubric_items):
        rubric_items[0]["critical"] = True

    case_id = f"agentclinic-{Path(source_file).stem.replace('_', '-')}-{index:04d}"
    return {
        "schemaVersion": 1,
        "id": case_id,
        "version": 1,
        "internalTitle": f"[AgentClinic {Path(source_file).name} #{index}] {diagnosis}",
        "public": {
            "displayTitle": _t(f"{actor.get('Demographics', 'Adult patient')} presenting with {primary.lower()}"),
            "specialty": "Ерөнхий",
            "difficulty": "intermediate",
            "tags": [],
            "setting": _t("Outpatient clinic"),
            "patient": {"name": "Өвчтөн", "age": age, "sex": sex},
            "chiefComplaint": _t(primary),
            "chiefComplaintTopics": cc_topics,
            "openingLine": _t(f"Doctor, I came because of {primary.lower()}."),
            "estimatedMinutes": 15,
            "timeCritical": False,
        },
        "persona": {
            "personality": _t("Cooperative adult patient."),
            "speakingStyle": _t("Plain, short colloquial sentences."),
            "emotionalState": _t("Somewhat worried."),
        },
        "hidden": {
            "diagnosis": {"label": _t(diagnosis), "acceptedAliases": [diagnosis.lower()], "partialAliases": []},
            "differentials": [],
            "summary": _t(osce.get("Objective_for_Doctor", "")),
            "facts": facts,
            "investigationsAvailable": False,
        },
        "rubric": {"items": rubric_items},
        "education": {"explanation": _t(f"Expected diagnosis: {diagnosis}."), "learningPoints": [_t("Auto-generated — write learning points during review.")]},
        "provenance": {
            "source": "agentclinic",
            "sourceId": f"{Path(source_file).name}#{index}",
            "sourceUrl": "https://github.com/SamuelSchmidgall/AgentClinic",
            "synthetic": False,
            "authors": ["Schmidgall et al. (AgentClinic, arXiv:2405.07960)"],
            "createdAt": "",
            "license": "AgentClinic repository: MIT; upstream case content terms must be verified (MedQA / NEJM)",
            "attribution": "Adapted from AgentClinic (Schmidgall et al., 2024).",
            "redistributable": False,
            "trainingUseAllowed": False,
            "clinicalReview": {"status": "unreviewed"},
            "translation": {"sourceLanguage": "en", "status": "machine"},
        },
    }


def convert_file(path: Path, out_dir: Path, limit: int | None = None) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for index, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
        if limit is not None and index >= limit:
            break
        if not line.strip():
            continue
        draft = convert_record(json.loads(line), index, path.name)
        target = out_dir / f"{draft['id']}.json"
        target.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")
        written.append(target)
    return written
