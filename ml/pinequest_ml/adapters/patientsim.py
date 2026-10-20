"""PatientSim (PhysioNet, credentialed access) — guarded adapter.

Source: https://physionet.org/content/persona-patientsim/ (v1.0.0, 2025-10-18).
Licence: PhysioNet Credentialed Health Data License 1.5.0 + DUA; requires a
credentialed PhysioNet account and CITI "Data or Specimens Only Research"
training. Profiles are derived from MIMIC-IV / MIMIC-IV-ED / MIMIC-IV-Note
(real, de-identified patients).

Consequences for this project:
  * Never commit the files or anything derived from them to the repository.
  * Never send the content to third-party APIs (e.g. hosted LLM translation)
    unless the DUA explicitly permits it — PhysioNet's credentialed licence
    generally forbids sharing with third parties.
  * Whether fine-tuning and releasing a model trained on it is allowed must be
    checked against the DUA by the data custodian; until then do not use it
    for training.

We have NOT had access to the files, so `patient_profile.json`'s field names
are unverified. This adapter therefore only inventories the keys of a local
copy so a credentialed team member can write the field mapping.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any


class DataUseAgreementRequired(RuntimeError):
    pass


def _keys(value: Any, prefix: str = "") -> list[str]:
    if isinstance(value, dict):
        out = []
        for key, sub in value.items():
            out.append(f"{prefix}{key}")
            out += _keys(sub, f"{prefix}{key}.")
        return out
    if isinstance(value, list) and value:
        return _keys(value[0], f"{prefix}[].")
    return []


def inventory(path: Path, dua_confirmed: bool) -> dict[str, Any]:
    if not dua_confirmed:
        raise DataUseAgreementRequired(
            "PatientSim requires PhysioNet credentialed access and a signed DUA. "
            "Re-run with --i-have-a-physionet-dua only if you personally hold that access."
        )
    data = json.loads(path.read_text(encoding="utf-8"))
    records = data if isinstance(data, list) else list(data.values()) if isinstance(data, dict) else []
    counter: Counter[str] = Counter()
    for record in records:
        counter.update(set(_keys(record)))
    return {"records": len(records), "fields": counter.most_common()}
