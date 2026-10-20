"""MediTOD dialogues → (doctor question, topics, patient answer) pairs.

Source: https://github.com/dair-iitd/MediTOD (EMNLP 2024). As of 2026-10-20 the
repository has NO licence file (GitHub API: 404). `data/dialogs.json` is public
but contains only 3 sample dialogues; `raw_data/` holds non-canonicalised
annotations; the full canonicalised dataset requires a UMLS licence and an
access request form. The underlying dialogues come from Fareez et al. (2022).
Do not redistribute or train on it until the licence is clarified with the authors.

Verified record structure (data/dialogs.json):
  {dialog_id: {"utterances": [{speaker, uttr_id, text, keywords,
    actions:[{action, symptom:[{value, checks:[{type, values}]}]}]   # doctor
    dialog_state:{positive_symptom:[...], ...}}]}}                   # patient

Use: English question-style reference for growing the Mongolian question bank
and an evaluation set for the topic classifier (after translation). It is not
converted into patient cases.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .english_topics import guess_topics

CHECK_TOPICS = {
    "onset": "onset",
    "duration": "duration",
    "progression": "progression",
    "location": "location",
    "characteristics": "character",
    "severity": "severity",
    "frequency": "duration",
    "radiation": "radiation",
    "aggravating_factor": "aggravating",
    "alleviating_factor": "relieving",
}

SYMPTOM_TOPICS = {
    "coughing": "cough",
    "dyspnea": "dyspnea",
    "fever": "fever",
    "chest pain": "chest_pain",
    "headache": "headache",
    "nausea": "nausea",
    "vomiting": "vomiting",
    "diarrhea": "diarrhea",
    "fatigue": "fatigue",
    "sputum": "sputum",
    "chills": "chills",
    "weight loss": "weight_loss",
}


def doctor_topics(utterance: dict[str, Any]) -> list[str]:
    topics: list[str] = []
    for action in utterance.get("actions", []) or []:
        for key, values in action.items():
            if not isinstance(values, list):
                continue
            for item in values:
                if not isinstance(item, dict):
                    continue
                value = str(item.get("value", "")).lower()
                checks = item.get("checks") or []
                for check in checks:
                    mapped = CHECK_TOPICS.get(str(check.get("type", "")).lower())
                    if mapped and mapped not in topics:
                        topics.append(mapped)
                if not checks and key in ("symptom",):
                    mapped = SYMPTOM_TOPICS.get(value)
                    if mapped and mapped not in topics:
                        topics.append(mapped)
    return topics or guess_topics(utterance.get("text", ""))


def extract_pairs(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    pairs = []
    for dialog_id, dialog in data.items():
        utterances = dialog.get("utterances", [])
        for i, utt in enumerate(utterances[:-1]):
            nxt = utterances[i + 1]
            if utt.get("speaker") == "doctor" and nxt.get("speaker") == "patient":
                pairs.append({"dialog_id": dialog_id, "question_en": utt["text"], "topics": doctor_topics(utt), "answer_en": nxt["text"], "question_mn": "", "answer_mn": ""})
    return pairs
