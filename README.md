# PineQuest AI Patient — Mongolian AI Patient Simulator

An educational web application where Mongolian medical students practise
clinical **history-taking** and **diagnostic reasoning** by interviewing an AI
that behaves like a real patient. The patient answers in natural Mongolian, only
what is asked, and never reveals its hidden diagnosis. After the student submits
a suspected diagnosis, the app scores the diagnosis *and* the quality of the
interview against a case-specific rubric and explains what was asked, what was
missed and why it matters.

> ⚠️ **Educational simulation only.** Not for diagnosing or treating real
> patients. The three bundled cases are **synthetic** and have **not** been
> reviewed by a clinician.

```
Эмч ээ, цээж өвдөөд байна.                         ← patient reveals only the chief complaint
> Хэзээнээс өвдөж эхэлсэн бэ?
Өнөө өглөө долоон цагийн үед, машинаа халааж байхад гэнэт өвдөж эхэлсэн.
> Өвдөлт өөр газар руу дамжиж байна уу?
Тийм ээ, зүүн гар руу дамжаад байх шиг байна. Эрүү рүү ч бас жаахан өвдөөд байгаа.
> Таны онош юу вэ?
Мэдэхгүй ээ, эмч ээ. Тийм болохоор л танд үзүүлэх гэж ирсэн шүү дээ.
```

## What works now

| Area | Status |
|---|---|
| Landing page, registration/login (student & admin roles), dashboard, history | ✅ |
| Interview workspace (desktop two-column, mobile stacked), typing indicator, narrator exam notes | ✅ |
| Hidden structured cases, strict disclosure engine, leak/consistency validation | ✅ |
| Diagnosis submission and deterministic, case-specific evaluation + feedback | ✅ |
| Admin: JSON case editor with validation, student preview, publish status, import/export, data-quality report, training-data approval, provider diagnostics | ✅ |
| Providers: mock (no key), Gemini (free tier), Claude (paid), OpenAI-compatible (Ollama/vLLM), fine-tuned (verified) | ✅ implemented · Gemini/Claude/fine-tuned not exercised against live services in this environment (no keys) |
| PostgreSQL (Neon) + embedded PGlite for local/tests | ✅ |
| Fine-tuning data pipeline (synthetic dialogues, transcripts, splits, quality report, adapters, translation workflow) | ✅ |
| LoRA/QLoRA training, evaluation, inference service | ✅ implemented · only a CPU smoke run executed (see below) |
| A trained Mongolian patient model | ❌ **not trained yet** — needs reviewed data and a GPU run |

## Technology

- **Web:** Next.js 16 (App Router, Route Handlers), React 19, TypeScript, Tailwind CSS 4, Inter (Cyrillic)
- **Data:** PostgreSQL via Drizzle ORM — Neon in production, PGlite (embedded Postgres) locally and in tests
- **Auth:** iron-session encrypted cookies + bcrypt, roles `student` / `admin`
- **Validation:** zod (case schema → exported JSON Schema for Python)
- **AI providers:** REST (Gemini), `@anthropic-ai/sdk` (Claude), OpenAI-compatible HTTP, own inference service
- **ML:** Python 3.11, uv, Transformers + PEFT (LoRA/QLoRA), bitsandbytes (CUDA), FastAPI inference service
- **Tests:** Vitest (TypeScript), pytest (Python)

## Frontend (student screens)

- **Stack:** Next.js App Router + Tailwind v4 tokens (`src/app/globals.css`), `motion` for animation, `lucide-react` icons, Inter + Manrope (Cyrillic Extended, so ө/ү render).
- **Text:** every student-facing string lives in `src/i18n/mn.ts`; `src/i18n/en.ts` is the English copy for judges.
- **API calls:** all wrapped in `src/lib/api.ts` (`ConsultBackend`). The offline demo (`/demo`, `src/lib/demo/`) implements the same interface with 2 scripted cases, so the demo works without the database or model.
- **Theme:** light/dark via a `theme` cookie; without it the OS setting applies (CSS `light-dark()`).
- **Motion:** transform/opacity only; `prefers-reduced-motion` stops loops (global CSS rule + `MotionConfig reducedMotion="user"`).
- **Vitals / mood / notes:** the API only has *initial* vitals, so the monitor drifts slightly around them; mood is inferred from public case data; clinical notes are a keyword pass over the visible chat. The diagnosis-confidence slider is browser-only (sessionStorage).
- **Voice:** `src/lib/audio/recorder.ts` records 16 kHz mono WAV and posts it to `POST /api/speech/transcribe` (→ `{ text }`), the contract of the `voice-avatar-and-scoring-fixes` branch. Until that endpoint exists the UI asks the student to type. Patient audio is played from `GET /api/sessions/:id/messages/:messageId/audio` when available.
- **3D later:** `src/components/patient/patient-view.tsx` is the swap point for a react-three-fiber avatar.

## Architecture in one paragraph

The browser only ever receives public case fields and chat messages. For each
question the server classifies it into clinical topics, a **deterministic
disclosure engine** decides which hidden facts may be revealed, a **restricted
prompt** (no diagnosis, no rubric, no unasked facts) is sent to the configured
model, and a **server-side validator** rejects replies that leak the diagnosis or
unasked facts (falling back to reviewed template wording). Exam findings come
from a separate narrator. Evaluation is independent and rule-based. The same
prompt format is used to build fine-tuning data, verified by parity tests.
Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
src/
  app/                    pages (landing, login, dashboard, interview, sessions, admin) + api/ route handlers
  components/             UI, interview workspace, feedback report, admin tools
  lib/cases/              canonical case schema, public view, demo loader
  lib/patient/            topics, classifier, disclosure engine, context/prompt, validator, simulator, providers/
  lib/evaluation/         diagnosis matching + rubric scoring
  lib/services/           sessions, cases, users, training, quality, diagnostics, narrative
  lib/db/                 Drizzle schema + client (Postgres / PGlite)
data/cases/               synthetic demo cases (canonical JSON)
data/schema/              JSON Schema + topic list exported for Python
data/question-bank/       Mongolian question paraphrases per topic
drizzle/                  SQL migrations
ml/                       Python data pipeline, training, evaluation (see ml/README.md)
inference/                FastAPI service for the fine-tuned model
tests/                    end-to-end API tests
docs/                     architecture and deployment guides
```

## Run locally (macOS)

```bash
npm install
cp .env.example .env
# set SESSION_SECRET (openssl rand -base64 32) and SEED_ADMIN_PASSWORD (≥ 8 chars) in .env
npm run setup        # create local database, seed 3 demo cases + admin (+ demo student)
npm run dev          # http://localhost:3000
```

No API key is needed: `PATIENT_PROVIDER=mock` (default) answers from the
reviewed case wording. Log in with the seeded admin or register a student.

## Tests and build

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run cases:validate
cd ml && uv venv --python 3.11 && uv pip install -e ".[dev]" && .venv/bin/python -m pytest -q
```

## Configuration

All variables are documented in [.env.example](.env.example) and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#2-environment-variables). Switching the
patient model is configuration only:

```bash
PATIENT_PROVIDER=gemini      GEMINI_API_KEY=...        # free tier (aistudio.google.com)
PATIENT_PROVIDER=anthropic   ANTHROPIC_API_KEY=...     # paid
PATIENT_PROVIDER=openai_compatible  OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1  OPENAI_COMPAT_MODEL=qwen3:4b
PATIENT_PROVIDER=finetuned   FINETUNED_BASE_URL=... FINETUNED_EXPECTED_ADAPTER=...
```

The provider that actually answered is stored on every message and shown in
*Админ → AI загварын төлөв*; students see a "Демо горим" badge in mock mode.

## Scoring

Default weights: **40% diagnosis, 40% history-taking coverage, 20% critical
questions**, configurable per case (`rubric.weights`). A correct diagnosis alone
cannot give a perfect score and a wrong diagnosis keeps the credit for good
questions. Diagnoses match reviewed Mongolian/English aliases (with suffix and
small-typo tolerance); partial credit for less specific answers. No language
model decides correctness.

## Datasets and licensing

Only synthetic, project-written cases are bundled. External sources were checked
on 2026-10-20 (details and preparation steps in [ml/README.md](ml/README.md#2-datasets-sources-licences-and-how-to-prepare-them)):

- **AgentClinic** — public, repository MIT; upstream MedQA/NEJM case terms must be verified before redistribution or training.
- **MediTOD** — no licence file; full data needs a UMLS licence and request form; only a 3-dialogue sample is public.
- **PatientSim** — PhysioNet credentialed access + DUA (MIMIC-derived); not redistributable; we do not hold access.

No external dataset content is committed to this repository.

## Fine-tuning workflow (summary)

1. Add reviewed Mongolian cases (write them, or adapt AgentClinic → translate → review).
2. Optionally approve real student transcripts in the admin panel and export them.
3. `python -m pinequest_ml build` → case-split JSONL + quality report.
4. Pick a base model by zero-shot evaluation (default `Qwen/Qwen3-4B-Instruct-2507`, Apache-2.0).
5. Train QLoRA on a free Kaggle/Colab GPU: `python -m pinequest_ml train --config configs/train_qwen3_4b_qlora.yaml`.
6. Evaluate (`python -m pinequest_ml evaluate ...`), serve with `inference/`, set `PATIENT_PROVIDER=finetuned`.

## Deployment

Web app → Vercel (free Hobby) + Neon (free Postgres). Fine-tuned model → a
separate GPU host running `inference/` (cannot run on Vercel). Step-by-step:
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Current limitations

- Demo cases are synthetic, AI-assisted drafts; Mongolian wording and clinical content need review by Mongolian clinicians before classroom use.
- Mock mode understands questions through a keyword lexicon; unusual phrasings get "please rephrase". `INTENT_CLASSIFIER=hybrid` with an LLM improves this.
- Rate limiting is in-memory (per server instance).
- Only 3 cases → the training pipeline is demonstrable, but a useful model needs many more reviewed cases.
- No live Gemini/Claude/fine-tuned calls were made during development (no credentials); these paths are covered by tests with mocked HTTP responses.

## Future work

More reviewed cases per specialty; physical-exam and investigation modules;
speech input (Mongolian ASR); teacher dashboards and cohorts; Redis-based rate
limiting; Mongolian paraphrase augmentation reviewed by clinicians; a trained
and evaluated Mongolian patient model.

## Licence

Code: to be decided by the project team. Demonstration cases: project-owned
synthetic content. External datasets keep their own licences.

## Verification log (what was actually executed, 2026-10-20, MacBook Pro M3, 8 GB)

- `npm run lint`, `npm run typecheck`, `npm test` (131 Vitest tests: disclosure rules, leakage, prompt
  injection, evaluator, providers with mocked HTTP, API end-to-end on in-memory Postgres), `npm run build` — all pass.
- `pytest` in `ml/` (41 tests incl. 33 byte-for-byte prompt parity fixtures) — pass.
- Full student flow driven in headless Chrome (desktop + mobile): register/login → case → 6 questions →
  diagnosis → feedback; no console errors.
- Dataset build on the 3 demo cases: 1,776 turn examples, case-level splits, no leakage.
- AgentClinic adapter run on the real `agentclinic_medqa.jsonl` (5 records) and MediTOD adapter on its
  public 3-dialogue sample (178 pairs) — outputs kept locally, not committed.
- **Smoke LoRA run only:** `Qwen/Qwen2.5-0.5B-Instruct`, 12 steps on CPU (MPS ran out of memory on 8 GB),
  48 examples; train loss 0.62, eval loss 0.56. Served with `inference/server.py`; `/health`, API-key auth and
  `/v1/chat/completions` worked; the app's fine-tuned provider verified the adapter id and called it.
  The smoke model's Mongolian answers were poor (eval chrF 0.31) and the app's validator rejected them
  (falling back to template answers and showing that in the UI). **This is a pipeline test, not a trained
  patient model.**
- Not executed: Gemini / Claude live calls (no API keys in this environment), a GPU QLoRA run, deployment to
  Vercel/Neon.
