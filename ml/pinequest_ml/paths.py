"""Repository-relative paths shared by the pipeline."""

from __future__ import annotations

from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ML_ROOT.parent

CASES_DIR = REPO_ROOT / "data" / "cases"
SCHEMA_DIR = REPO_ROOT / "data" / "schema"
QUESTION_BANK = REPO_ROOT / "data" / "question-bank" / "mn.classified.json"
GLOSSARY = REPO_ROOT / "data" / "glossary" / "medical_en_mn.csv"

# Local, git-ignored working directories (may contain restricted data).
RAW_DIR = ML_ROOT / "data" / "raw"
INTERIM_DIR = ML_ROOT / "data" / "interim"
PROCESSED_DIR = ML_ROOT / "data" / "processed"
OUTPUTS_DIR = ML_ROOT / "outputs"
