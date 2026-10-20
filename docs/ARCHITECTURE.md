# Architecture and key decisions

## Overview

```
Browser (Next.js React, Mongolian UI)
   │  only PublicCase + chat messages + (after submission) evaluation
   ▼
Next.js 16 server (Vercel) ─ Route Handlers /api/* + Server Components
   ├─ auth (iron-session cookie, bcrypt, roles student/admin)
   ├─ services/sessions ── patient/simulator ──┬─ classifier (keyword, optional LLM topic label)
   │                                            ├─ engine (disclosure plan)      ← private case
   │                                            ├─ context (restricted prompt)  → provider
   │                                            ├─ provider: mock | gemini | anthropic | openai_compatible | finetuned
   │                                            └─ validator (leak/consistency) → fallback
   ├─ evaluation/ (deterministic rubric scoring; optional validated narrative)
   └─ db (Drizzle) ── PostgreSQL (Neon)  |  PGlite (local dev/tests)

ml/ (Python) ── builds training data with the SAME prompt format ── LoRA/QLoRA ── adapter
inference/ (FastAPI on a GPU host) ── /health (adapter id) + /v1/chat/completions ◄── finetuned provider
```

## The disclosure pipeline (why the diagnosis cannot leak)

1. **Classification** (`src/lib/patient/classifier.ts`): the question is mapped
   to taxonomy topics (`topics.ts`) by deterministic Mongolian/English patterns.
   Optionally (`INTENT_CLASSIFIER=hybrid`) a model picks a topic label when no
   pattern matches — it only sees the question and the public topic list.
2. **Planning** (`engine.ts`): code decides what is allowed: facts tagged with
   the asked topics (max 4), consistent negatives for absent symptoms, "don't
   know" for uncovered history, a limited answer for broad questions, nothing for
   diagnosis requests or prompt injection. Exam findings go to a narrator.
3. **Restricted context** (`context.ts`): persona, chief complaint, the allowed
   facts, what was already said, recent conversation. Never the diagnosis,
   differentials, rubric, summary or undisclosed facts.
4. **Generation**: the provider phrases the allowed facts. The mock provider joins
   the reviewed case wording.
5. **Validation** (`validator.ts`, server-side, uses the private case): rejects
   replies that name the diagnosis/differentials, contain leak terms of
   undisclosed facts, step out of character, are not Mongolian, or fail to deny an
   absent symptom. A rejected reply is replaced by the template answer and the
   fallback is recorded on the message.
6. **Storage**: student messages store topics + mode; patient messages store the
   provider that actually answered, fallback reason and disclosed fact ids.

The browser never receives the private case: `toPublicCase()` is an allow-list,
`MessageView` excludes topics/fact ids, and the evaluation is returned only after
the diagnosis is submitted. Tests assert this for the case list, session view and
model inputs.

## Evaluation

`src/lib/evaluation/` is independent of generation. Diagnosis correctness uses
reviewed aliases (exact, Mongolian-suffix and small-typo tolerant; partial
credit for less specific answers or a correct diagnosis listed second;
differentials recognised). Rubric items are case-specific, weighted, and split
into *history* and *critical* components. Default weights 40/40/20
(diagnosis/history/critical) are configurable per case (`rubric.weights`) and in
code (`DEFAULT_SCORE_WEIGHTS`). Results are stored with `evaluatorVersion` and the
frozen case snapshot, so they can be audited and recomputed. An optional LLM
paragraph (`FEEDBACK_NARRATIVE=llm`) is generated after the score is saved, from
the structured result only, and is discarded if it mentions a different score.

## Key decisions

| Decision | Why |
|---|---|
| Next.js 16 App Router, Route Handlers, no separate backend | One deployable on Vercel; the ML service is separate because it needs a GPU. |
| Cache Components disabled | Nearly every page depends on the user and DB; dynamic rendering avoids caching private data. |
| Drizzle + PostgreSQL (Neon) with PGlite fallback | Free hosted Postgres in production; zero-install local dev and fully offline tests against real Postgres semantics. |
| iron-session + bcrypt instead of Auth.js | Recommended by the Next 16 docs, few moving parts, testable from Route Handlers (cookie header). Email+password with student/admin roles. Admin role is re-read from the DB on every admin request. |
| Deterministic disclosure + validation instead of prompt-only secrecy | System prompts alone are not a security boundary. |
| Case snapshot per session | Editing a case never changes an ongoing or past interview/evaluation. |
| Same prompt renderer for app and training data (parity tests) | Prevents train/serve skew for the fine-tuned model. |
| Provider verification for the fine-tuned model | The app must never claim "fine-tuned" when another model answered. |
| In-memory rate limiting | Free and simple; documented as best-effort on serverless (use Redis for strict limits). |
| JSON case editor (not a large form builder) | Cases are deeply nested; JSON + schema validation + preview + quality hints is reliable and complete. CSV is not supported for cases (documented). |

## Data model (`src/lib/db/schema.ts`)

`users` · `cases` (private JSON, status, licence, review) · `interview_sessions`
(case snapshot, provider) · `messages` (role, topics, mode, provider, fallback,
validation issues) · `disclosed_facts` · `diagnosis_submissions` · `evaluations`
(versioned JSON result, optional narrative) · `training_examples` (admin-approved
transcripts) · `model_registry` (fine-tuned model metadata).

## Emergency-scenario policy

Time-critical cases (`public.timeCritical`, `education.emergency`) teach
recognition and escalation: the feedback page shows the escalation steps that
would apply in real practice and states that the simulation does not replace
clinical supervision. A permanent footer reminds users to call 103 in a real
emergency and that the app must not be used for real patients.
