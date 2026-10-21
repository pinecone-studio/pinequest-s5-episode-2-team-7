# PineQuest ML — data preparation, fine-tuning and evaluation

This folder turns structured patient cases into instruction-tuning data, fine-tunes
an open model with LoRA/QLoRA to act as a Mongolian simulated patient, and
evaluates it. The web app works without any of this (mock / Gemini / Claude
providers); the pipeline lets the project replace the general model with its own.

> **Status (be precise):** the data pipeline, training script, evaluation and
> inference service are implemented and tested. A *smoke-test* LoRA run on a
> 0.5B model was executed on a MacBook only to verify the code path (see
> “Verification log” below). **No usable fine-tuned patient model has been
> trained yet** — that requires a GPU run on reviewed data.

## Three different things

| | What | Status |
|---|---|---|
| 1 | Patient simulator powered by an existing model (mock, Gemini, Claude, Ollama) | ✅ working in the app |
| 2 | Dataset prepared for Mongolian patient simulation | ✅ pipeline + 3 synthetic demo cases (1.7k turn examples); needs many more reviewed cases |
| 3 | An actually fine-tuned model | ⏳ reproducible path below; not yet trained |

## Design: train exactly what the app will ask

The app never lets a model decide what to disclose. For each student question the
app's disclosure engine selects the allowed facts and renders a **restricted
prompt** (persona + allowed facts + conversation, no diagnosis). The fine-tuned
model only learns to turn that prompt into natural Mongolian patient speech.

`pinequest_ml/prompt.py` is a byte-identical Python port of the app's planner,
context builder, prompt renderer and template reply. `tests/test_prompt_parity.py`
checks it against fixtures exported from the TypeScript engine
(`npm run ml:fixtures`), so training inputs and production inputs cannot drift.

Each training example is one patient turn: `system` (restricted prompt) +
conversation so far + `assistant` target. Targets are the reviewed case wording
selected by the planner, so the model learns to:

- answer only the asked topic; deny absent symptoms consistently ("ҮГҮЙ")
- say it does not know uncovered history ("МЭДЭХГҮЙ") instead of inventing
- repeat earlier facts consistently; give limited answers to broad questions
- refuse in character to reveal a diagnosis or follow prompt injection

## Setup

```bash
cd ml
uv venv --python 3.11 && uv pip install -e ".[dev]"        # data pipeline + tests (any machine)
uv pip install -e ".[train]"                                # training deps (GPU machine)
.venv/bin/python -m pytest -q
```

## 1. Build the dataset

```bash
python -m pinequest_ml validate                 # canonical cases in ../data/cases
python -m pinequest_ml build                    # → data/processed/{train,validation,test}.jsonl
cat data/processed/quality_report.md
```

`configs/data.yaml` controls seeds, dialogue length, split ratios and review
gates (`require_clinical_review`, `require_translation_review` — turn these on
for any model meant for students). Splits are by **case**, never by turn, so a
case never appears in two splits. The quality report lists case/example counts,
language, duplicates, invalid/excluded cases, licensing and review status.

Add real interview transcripts: in the app, an admin approves completed sessions
(*Админ → Ярилцлага*), downloads *Зөвшөөрсөн сургалтын ярилцлагууд (JSONL)*, then:

```bash
python -m pinequest_ml build --sessions ~/Downloads/pinequest-approved-sessions.jsonl
```

## 2. Datasets: sources, licences, and how to prepare them

Nothing is downloaded automatically. Put permitted files in `ml/data/raw/`
(git-ignored). Status checked on **2026-10-20**:

| Dataset | Official source | Availability / licence (as checked) | Redistribute? | Fine-tune? | What we use it for |
|---|---|---|---|---|---|
| **AgentClinic** | [github.com/SamuelSchmidgall/AgentClinic](https://github.com/SamuelSchmidgall/AgentClinic) | Public; repository licence **MIT** (GitHub API). Cases: `agentclinic_medqa(_extended).jsonl` (MedQA/USMLE-derived), `agentclinic_nejm(_extended).jsonl` (NEJM Image Challenge-derived). MIMIC-IV variant needs PhysioNet approval. Cite Schmidgall et al. 2024 (arXiv:2405.07960). | Code: yes (MIT). Case content: **verify upstream terms**; treat NEJM-derived content as not redistributable. | Only after you confirm the upstream terms; adapter sets `trainingUseAllowed: false` until a person changes it. | English source cases → Mongolian cases |
| **MediTOD** | [github.com/dair-iitd/MediTOD](https://github.com/dair-iitd/MediTOD) (EMNLP 2024) | **No licence file** in the repository. `data/dialogs.json` is a 3-dialogue public sample; full canonicalised data requires a **UMLS licence + request form**. Built on Fareez et al. 2022 dialogues. | No (no licence) | Not until licence is clarified with the authors | English question style; classifier evaluation after translation |
| **PatientSim** | [physionet.org/content/persona-patientsim](https://physionet.org/content/persona-patientsim/) (NeurIPS 2025 D&B) | **Credentialed access**: PhysioNet Credentialed Health Data License 1.5.0 + DUA, CITI training. 170 profiles derived from MIMIC-IV/-ED/-Note. | **No** | Only if the DUA permits; never send to third-party APIs (incl. machine translation) | Persona design reference; optional local use by credentialed members |

We have **not** reviewed the full MediTOD or PatientSim data; their adapters are
built from the verified public sample (MediTOD) or deliberately limited to a
field inventory (PatientSim, which requires a DUA we do not hold).

### AgentClinic → Mongolian cases

```bash
curl -L -o data/raw/agentclinic_medqa.jsonl \
  https://raw.githubusercontent.com/SamuelSchmidgall/AgentClinic/main/agentclinic_medqa.jsonl
python -m pinequest_ml adapt-agentclinic data/raw/agentclinic_medqa.jsonl --limit 20
#   → data/interim/agentclinic/*.json  (English drafts, mn fields empty, topics guessed)
python -m pinequest_ml translate export          # → data/interim/translation_worksheet.csv
GEMINI_API_KEY=... python -m pinequest_ml translate machine --limit 200   # optional machine draft (free tier)
#   Medical translators fill mn_reviewed + reviewer in the CSV (Excel / Google Sheets)
python -m pinequest_ml translate import          # → data/interim/translated/*.json
python -m pinequest_ml validate data/interim/translated/*.json
```

Then, for each case: fix topic assignments, write Mongolian patient wording in a
natural colloquial register, add diagnosis aliases (mn + en), differentials, a
proper rubric, `leakTerms`, and have a clinician review it. Set
`provenance.trainingUseAllowed: true` only after licence review. Translated cases
in `data/interim/translated/` are picked up automatically by `build`, and can be
imported into the app (*Админ → Импорт*).

Translation rules: keep `en` (source) and `mn` separate; `translation.status`
becomes `human_reviewed` only when every field has a reviewed translation and a
reviewer; machine drafts stay `machine`. The seed glossary is
`../data/glossary/medical_en_mn.csv` — extend it with your clinical reviewers.
Do not translate long documents into "conversations": cases are converted into
structured facts first, and dialogues are generated from the facts.

### MediTOD / PatientSim

```bash
python -m pinequest_ml adapt-meditod data/raw/meditod_sample_dialogs.json   # → question/answer pairs
python -m pinequest_ml inventory-patientsim data/raw/patient_profile.json --i-have-a-physionet-dua
```

## 3. Choose a base model

Candidates checked on Hugging Face on 2026-10-20 (licence tags from the model pages):

| Model | Size | Licence | Notes |
|---|---|---|---|
| `Qwen/Qwen3-4B-Instruct-2507` | 4B, text-only | Apache-2.0 | **Default.** Fits QLoRA on a free 16 GB T4; mature Transformers/PEFT support; no "thinking" mode. |
| `google/gemma-4-E4B-it` | ~8B params (E4B), multimodal | Apache-2.0 | Newer, likely stronger multilingual; multimodal architecture — confirm loading with `--dry-run`; tighter on a T4. |
| `Qwen/Qwen3.5-4B` | ~4.7B, multimodal | Apache-2.0 | Newer Qwen generation; image-text architecture — verify CausalLM loading first. |
| `meta-llama/Llama-3.2-3B-Instruct` | 3B | Llama 3.2 Community (gated) | Mongolian not in its officially supported languages. |
| `Qwen/Qwen2.5-0.5B-Instruct` | 0.5B | Apache-2.0 | Smoke tests only. |

None of these model cards documents Mongolian quality, so **measure it**: serve
each base model with Ollama or vLLM (our inference service always loads an
adapter) or load it locally with `--base-model`, and run the same evaluation
zero-shot:

```bash
python -m pinequest_ml evaluate --endpoint http://localhost:11434/v1 --model qwen3:4b --split data/processed/validation.jsonl --limit 100
```

Pick the model with the best Mongolian rate / chrF and zero leakage, then fine-tune.

**Baseline set.** Every baseline (and later the fine-tuned adapter) is scored on
the same fixed sample: `--split data/processed/validation.jsonl,data/processed/test.jsonl --sample 120`
(spread evenly over the held-out cases and turn modes; `build` is deterministic,
so a rebuild on Kaggle gives the same 120 examples). Hosted APIs read the key
from an environment variable and pace themselves for free tiers:

```bash
S=data/processed/validation.jsonl,data/processed/test.jsonl
# Gemini (what the app uses with PATIENT_PROVIDER=gemini)
python -m pinequest_ml evaluate --endpoint https://generativelanguage.googleapis.com/v1beta/openai \
  --model gemini-3.8-flash --api-key-env GEMINI_API_KEY --extra-body '{"reasoning_effort":"none"}' \
  --delay 6 --split $S --sample 120 --out outputs/eval/baseline
# Groq (PATIENT_PROVIDER=openai_compatible)
python -m pinequest_ml evaluate --endpoint https://api.groq.com/openai/v1 --model qwen/qwen3.8-27b \
  --api-key-env OPENAI_COMPAT_API_KEY --delay 3 --split $S --sample 120 --out outputs/eval/baseline
# Base Qwen3-4B, zero-shot (needs a GPU — run on Kaggle before training)
python -m pinequest_ml evaluate --base-model Qwen/Qwen3-4B-Instruct-2507 --split $S --sample 120 --out outputs/eval/baseline
```

## 4. Fine-tune (LoRA / QLoRA)

**Hardware.** QLoRA needs an NVIDIA GPU (CUDA + bitsandbytes). A MacBook Pro
(Apple Silicon, 8 GB) cannot run QLoRA; it can only run the tiny smoke config.
Free GPU options: **Kaggle Notebooks** (T4×2 / P100, ~30 GPU-h/week, internet
must be enabled in settings) or **Google Colab** (T4, session limits). Do not use
paid cloud GPUs unless the team decides to; nothing here launches cloud jobs.

```bash
# Locally (Mac) — pipeline smoke test only, ~5-10 min:
python -m pinequest_ml train --config configs/train_smoke_local.yaml

# On Kaggle / Colab (GPU):
git clone <your repo> && cd <repo>/ml
pip install -e ".[train]"
python -m pinequest_ml build
python -m pinequest_ml train --config configs/train_qwen3_4b_qlora.yaml --dry-run
python -m pinequest_ml train --config configs/train_qwen3_4b_qlora.yaml
python -m pinequest_ml evaluate --base-model Qwen/Qwen3-4B-Instruct-2507 \
       --adapter outputs/qwen3-4b-lora-v1/adapter --split data/processed/test.jsonl
# Download outputs/qwen3-4b-lora-v1/adapter (≈ 100-200 MB) — do NOT commit it to git.
```

Outputs: `outputs/<run>/adapter/` (LoRA weights, tokenizer, `pinequest_adapter.json`
with adapter id, base model, prompt format, dataset hash, metrics, git commit,
library versions). Store adapters in Hugging Face Hub (private repo), Kaggle
Datasets or Google Drive — not in this repository.

Synthetic examples alone do **not** produce a medically reliable model: the 3
demo cases are unreviewed and the model will mostly memorise their wording. A
useful model needs dozens to hundreds of reviewed cases plus approved transcripts.

## 5. Evaluate

`python -m pinequest_ml evaluate` writes `outputs/eval/<model>.summary.json` and
per-example details. Metrics: diagnosis leak rate, undisclosed-fact leak rate,
negation correctness on absent symptoms, Mongolian rate, length, chrF vs reviewed
reference — overall and per turn mode. `--reference` scores the references
themselves (should be perfect; checks the metric code).

## 6. Serve and connect to the app

See [`../inference/README.md`](../inference/README.md). In the app's environment:

```
PATIENT_PROVIDER=finetuned
FINETUNED_BASE_URL=https://<your-gpu-host>/v1
FINETUNED_API_KEY=<same as API_KEY on the server>
FINETUNED_EXPECTED_ADAPTER=pq-qwen3-4b-lora-v1
PATIENT_FALLBACK_PROVIDER=mock    # or none to show an error instead
```

The app checks `/health` and only labels answers "Fine-tuned" when the adapter
id and prompt format match; otherwise every answer is recorded as a fallback.

## Verification log

See the end of the repository README for what was actually executed.
