"""Offline tests for adapters, translation round-trip, dialogue synthesis and dataset build."""

import csv
import json
from pathlib import Path

import yaml

from pinequest_ml.adapters.agentclinic import convert_record
from pinequest_ml.adapters.meditod import doctor_topics
from pinequest_ml.adapters.patientsim import DataUseAgreementRequired, inventory
from pinequest_ml.build import assign_split, build
from pinequest_ml.dialogues import DialogueConfig, examples_from_session, synthesize_case
from pinequest_ml.schema import load_cases, validate_case, with_defaults
from pinequest_ml.translate import export_worksheet, import_worksheet

# Made-up record in the verified AgentClinic structure (no real data in tests).
AGENTCLINIC_LIKE = {
    "OSCE_Examination": {
        "Objective_for_Doctor": "Assess a patient with cough and fever.",
        "Patient_Actor": {
            "Demographics": "60-year-old male",
            "History": "The patient reports cough for 3 days. It started after a cold.",
            "Symptoms": {"Primary_Symptom": "Cough", "Secondary_Symptoms": ["Fever", "Shortness of breath"]},
            "Past_Medical_History": "Diabetes.",
            "Social_History": "Smokes 10 cigarettes a day.",
            "Review_of_Systems": "Denies chest pain.",
        },
        "Physical_Examination_Findings": {"Vital_Signs": {"Temperature": "38.5°C"}, "Lungs": "Crackles at right base."},
        "Test_Results": {"Chest_X-Ray": {"Findings": "Right lower lobe consolidation."}},
        "Correct_Diagnosis": "Community-acquired pneumonia",
    }
}

CASES = {c["id"]: with_defaults(c) for c in load_cases()}


def test_agentclinic_draft_becomes_valid_after_translation(tmp_path: Path):
    draft = convert_record(AGENTCLINIC_LIKE, 0, "agentclinic_medqa.jsonl")
    assert draft["provenance"]["trainingUseAllowed"] is False
    assert draft["provenance"]["redistributable"] is False
    assert all(f["answer"]["mn"] == "" for f in draft["hidden"]["facts"])
    assert any(f["kind"] == "investigation" and not f["patientKnows"] for f in draft["hidden"]["facts"])
    assert "pneumonia" not in draft["public"]["displayTitle"]["en"].lower()

    drafts = tmp_path / "drafts"
    drafts.mkdir()
    (drafts / f"{draft['id']}.json").write_text(json.dumps(draft), encoding="utf-8")
    worksheet = tmp_path / "ws.csv"
    n = export_worksheet(drafts, worksheet)
    assert n > 10

    with worksheet.open(encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    for row in rows:  # simulate reviewed translations
        row["mn_reviewed"] = f"Орчуулга: {row['en'][:40]}"
        row["reviewer"] = "Reviewer A"
    with worksheet.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    [out] = import_worksheet(worksheet, drafts, tmp_path / "translated")
    case = json.loads(out.read_text(encoding="utf-8"))
    assert case["provenance"]["translation"]["status"] == "human_reviewed"
    assert case["hidden"]["facts"][0]["answer"]["en"]  # English source kept separately
    assert validate_case(case) == []


def test_meditod_actions_map_to_topics():
    utt = {"speaker": "doctor", "text": "When did the cough start?", "actions": [{"action": "inquire", "symptom": [{"value": "coughing", "checks": [{"type": "onset"}]}]}]}
    assert doctor_topics(utt) == ["onset"]
    plain = {"speaker": "doctor", "text": "Do you smoke?", "actions": [{"action": "inquire"}]}
    assert doctor_topics(plain) == ["smoking"]


def test_patientsim_requires_dua(tmp_path: Path):
    path = tmp_path / "patient_profile.json"
    path.write_text(json.dumps([{"a": {"b": 1}}]))
    try:
        inventory(path, dua_confirmed=False)
        raise AssertionError("expected DataUseAgreementRequired")
    except DataUseAgreementRequired:
        pass
    assert inventory(path, dua_confirmed=True)["records"] == 1


def test_synthetic_dialogues_respect_disclosure():
    case = CASES["chest-pain-01"]
    examples = synthesize_case(case, DialogueConfig(dialogues_per_case=5), seed=0)
    assert examples
    diagnosis_terms = [case["hidden"]["diagnosis"]["label"]["mn"].lower(), "шигдээс"]
    for ex in examples:
        system = ex["messages"][0]["content"]
        target = ex["messages"][-1]["content"]
        assert ex["messages"][-1]["role"] == "assistant"
        # Model input never contains the diagnosis; family-history wording is the only allowed overlap.
        assert case["hidden"]["diagnosis"]["label"]["mn"] not in system
        if ex["mode"] in ("diagnosis_request", "injection"):
            assert ex["disclosed_fact_ids"] == []
            assert not any(t in target.lower() for t in diagnosis_terms)


def test_session_export_is_rebuilt_with_same_prompt_format():
    case = CASES["abdominal-pain-01"]
    record = {
        "id": "s1",
        "caseId": case["id"],
        "turns": [
            {"question": "Хэзээнээс өвдөж эхэлсэн бэ?", "topics": ["onset"], "mode": "answer", "disclosedFactIds": ["onset"], "answer": "Өчигдөр оройноос.", "provider": "gemini"},
            {"question": "Таны онош юу вэ?", "topics": ["diagnosis_request"], "mode": "diagnosis_request", "disclosedFactIds": [], "answer": "Мэдэхгүй ээ.", "provider": "gemini"},
        ],
    }
    examples, warnings = examples_from_session(record, case)
    assert warnings == []
    assert [e["mode"] for e in examples] == ["answer", "diagnosis_request"]
    assert examples[1]["messages"][-2]["content"] == "Таны онош юу вэ?"
    assert examples[1]["messages"][-3]["content"] == "Өчигдөр оройноос."


def test_build_splits_by_case_without_leakage(tmp_path: Path):
    config = {
        "seeds": [0],
        "dialogues": {"dialogues_per_case": 3},
        "split": {"ratios": {"train": 0.34, "validation": 0.33, "test": 0.33}, "salt": "t", "overrides": {"chest-pain-01": "train", "abdominal-pain-01": "validation", "cough-malaise-01": "test"}},
    }
    cfg = tmp_path / "data.yaml"
    cfg.write_text(yaml.safe_dump(config))
    report = build(cfg, None, tmp_path / "out")
    assert report["case_leakage_across_splits"] == []
    case_splits: dict[str, set[str]] = {}
    for split in ("train", "validation", "test"):
        rows = [json.loads(l) for l in (tmp_path / "out" / f"{split}.jsonl").read_text(encoding="utf-8").splitlines()]
        for r in rows:
            case_splits.setdefault(r["case_id"], set()).add(split)
    assert all(len(s) == 1 for s in case_splits.values())
    for case_id, split in config["split"]["overrides"].items():
        assert case_splits[case_id] == {split}
    assert (tmp_path / "out" / "quality_report.md").exists()
    assert assign_split("x", {"train": 1.0, "validation": 0, "test": 0}, "s") == "train"
