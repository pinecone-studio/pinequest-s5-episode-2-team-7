"""Heuristic English keyword → topic mapping used when adapting English sources.

Adapted cases are drafts: every guessed topic must be checked by a reviewer.
"""

from __future__ import annotations

import re

KEYWORDS: list[tuple[str, str]] = [
    (r"\b(chest pain|chest tightness|chest pressure)\b", "chest_pain"),
    (r"\b(abdominal|abdomen|stomach|belly|epigastric)\b", "abdominal_pain"),
    (r"\bheadache", "headache"),
    (r"\bback pain", "back_pain"),
    (r"\b(shortness of breath|dyspn|breathless|short of breath)", "dyspnea"),
    (r"\bnight sweats?", "night_sweats"),
    (r"\b(sweat|diaphore)", "sweating"),
    (r"\bnause", "nausea"),
    (r"\bvomit", "vomiting"),
    (r"\b(dizz|lighthead|syncop|faint)", "dizziness"),
    (r"\bpalpitat", "palpitations"),
    (r"\b(fever|febrile|pyrexia)", "fever"),
    (r"\b(chills|rigors)", "chills"),
    (r"\b(hemoptysis|haemoptysis|coughing up blood)", "hemoptysis"),
    (r"\bsputum|phlegm", "sputum"),
    (r"\bcough", "cough"),
    (r"\b(appetite|anorexia)", "appetite"),
    (r"\bdiarrh", "diarrhea"),
    (r"\b(constipat|bowel)", "constipation"),
    (r"\b(urin|dysuria|frequency)", "urinary"),
    (r"\b(vaginal|discharge)", "vaginal_symptoms"),
    (r"\b(fatigue|tired|weakness|malaise)", "fatigue"),
    (r"\bweight (loss|gain)", "weight_loss"),
    (r"\b(swelling|edema|oedema)", "leg_swelling"),
    (r"\brash", "rash"),
    (r"\b(jaundice|yellow)", "jaundice"),
    (r"\b(trauma|injur|fall)\b", "trauma"),
    (r"\b(smok|cigarette|tobacco|pack-year)", "smoking"),
    (r"\b(alcohol|drinks?|wine|beer)\b", "alcohol"),
    (r"\b(cocaine|heroin|illicit|recreational drug)", "substance_use"),
    (r"\b(works? as|employed|occupation|retired|student|designer|teacher|engineer)\b", "occupation"),
    (r"\b(lives with|lives alone|married)\b", "living_situation"),
    (r"\b(exercise|sedentary)\b", "exercise"),
    (r"\b(hypertension|high blood pressure)", "hypertension"),
    (r"\b(diabet)", "diabetes"),
    (r"\b(cholesterol|hyperlipid)", "hyperlipidemia"),
    (r"\b(medication|takes |taking |prescribed)", "medications"),
    (r"\ballerg", "allergies"),
    (r"\b(family history|father|mother|sister|brother)\b", "family_history"),
    (r"\b(menstrua|period|lmp)\b", "lmp"),
    (r"\bpregnan", "pregnancy"),
    (r"\b(sexual|contracept|condom)", "sexual_history"),
    (r"\b(travel|flight)", "travel"),
    (r"\b(surgery|operation|appendectomy|cholecystectomy)", "surgeries"),
    (r"\b(started|began|onset|ago|since)\b", "onset"),
    (r"\b(worse|aggravat|exacerbat)", "aggravating"),
    (r"\b(better|improv|reliev)", "relieving"),
    (r"\b(radiat|spread)", "radiation"),
]


def guess_topics(text: str, default: str | None = None) -> list[str]:
    lowered = text.lower()
    found: list[str] = []
    for pattern, topic in KEYWORDS:
        if re.search(pattern, lowered) and topic not in found:
            found.append(topic)
    if not found and default:
        found.append(default)
    return found[:3]


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.;])\s+", text or "") if s.strip()]
