# Setup and deployment guide

Everything below can be done for free (Neon free tier, Vercel Hobby, Gemini free
tier, Kaggle/Colab GPUs). Paid options are marked.

## 1. Local setup on macOS

Requirements: Node.js ≥ 20.19 (Vitest 5 needs `require(esm)`; tested with 24), npm. Python is only needed for `ml/`.

```bash
git clone <your-repo-url> PineQuest-AI-Patient && cd PineQuest-AI-Patient
npm install
cp .env.example .env
# Edit .env:
#   SESSION_SECRET=$(openssl rand -base64 32)
#   SEED_ADMIN_PASSWORD=<at least 8 chars>   (and optionally SEED_STUDENT_PASSWORD)
npm run setup          # migrate + seed demo cases, admin, demo student
npm run dev            # http://localhost:3000
```

With `DATABASE_URL` empty, an embedded PostgreSQL (PGlite) is stored in
`.data/pglite` — nothing to install. Delete that folder to reset local data.

To use Neon locally instead, put its connection string in `DATABASE_URL` and run
`npm run setup` again.

## 2. Environment variables

| Variable | Where | Required | Notes |
|---|---|---|---|
| `SESSION_SECRET` | local, Vercel | yes (prod) | ≥ 32 chars; `openssl rand -base64 32` |
| `DATABASE_URL` | local (optional), Vercel | yes on Vercel | Neon **pooled** URL with `sslmode=verify-full` (Neon shows `require`; change it to avoid the pg SSL warning) |
| `APP_URL` | Vercel | recommended | e.g. `https://pinequest.vercel.app` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | where you run `npm run db:seed` | for seeding | not needed at runtime |
| `SEED_STUDENT_EMAIL` / `SEED_STUDENT_PASSWORD` | same | optional | demo student |
| `PATIENT_PROVIDER` | local, Vercel | no (default `mock`) | `mock`, `gemini`, `anthropic`, `openai_compatible`, `finetuned` |
| `PATIENT_FALLBACK_PROVIDER` | local, Vercel | no (`mock`) | `none` shows an error instead of template answers |
| `INTENT_CLASSIFIER` | local, Vercel | no (`keyword`) | `hybrid` lets the model label unmatched questions |
| `FEEDBACK_NARRATIVE` | local, Vercel | no (`off`) | `llm` adds a validated AI paragraph |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Vercel | for `gemini` | free key at aistudio.google.com |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Vercel | for `anthropic` | paid |
| `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_MODEL`, `OPENAI_COMPAT_API_KEY` | Vercel | for `openai_compatible` | Ollama / vLLM / OpenRouter |
| `FINETUNED_BASE_URL`, `FINETUNED_API_KEY`, `FINETUNED_MODEL`, `FINETUNED_EXPECTED_ADAPTER` | Vercel | for `finetuned` | must match the inference service |
| `RATE_LIMIT_MESSAGES_PER_MINUTE` | Vercel | no (20) | per user |
| `CRON_SECRET` | Vercel | for the daily news import | ≥ 16 chars; `openssl rand -hex 32`; news translation also needs `GEMINI_API_KEY` |
| `BASE_MODEL`, `ADAPTER_PATH`, `API_KEY`, `LOAD_IN_4BIT` | **inference service only** | yes there | never in Vercel |
| `GEMINI_API_KEY` | `ml/` machine translation (optional) | no | do not use for restricted data |

No variable is exposed to the browser (no `NEXT_PUBLIC_*`). Never commit `.env`.

## 3. Database (Neon, free)

1. Create a project at https://neon.tech (region close to your Vercel region).
2. Copy the **pooled** connection string.
3. From your Mac: `DATABASE_URL='postgres://...' npm run setup`
   (applies `drizzle/` migrations, seeds demo cases + admin).
4. Schema changes later: edit `src/lib/db/schema.ts`, run `npm run db:generate`,
   commit the new file in `drizzle/`, then `npm run db:migrate` against Neon.

## 4. Deploy the web app (Vercel, free Hobby)

1. Push the repository to GitHub.
2. Vercel → *Add New Project* → import the repo (framework: Next.js; defaults OK).
3. Add environment variables (at least `SESSION_SECRET`, `DATABASE_URL`, `APP_URL`,
   plus the provider variables you use) for Production (and Preview if wanted).
4. Deploy. Check `https://<app>/api/health` → `{"ok":true}`.
5. Log in with the seeded admin, open *Админ → AI загварын төлөв* to confirm the
   provider is healthy.

Vercel's free plan limits function duration (check your plan); patient replies
are short and the provider timeout defaults to 20 s (`PROVIDER_TIMEOUT_MS`).

**Health news import.** `vercel.json` schedules `GET /api/cron/news-import`
once a day (00:00 UTC = 08:00 Улаанбаатар; Hobby allows daily crons). Set
`CRON_SECRET` and `GEMINI_API_KEY` in Vercel; Vercel sends the secret as a
Bearer token automatically. Each run reads the feeds in `src/lib/news/feeds.ts`,
skips links already stored, translates at most 10 new headlines + short
descriptions (never full articles) and saves them as **drafts** with a link to
the source. An admin reviews the machine translation in *Админ → Мэдээ* and
publishes it; the same import runs on demand with the *RSS-ээс татах* button.

## 5. Switching the patient AI

- **Free (recommended):** `PATIENT_PROVIDER=gemini`, `GEMINI_API_KEY=...`,
  `GEMINI_MODEL=gemini-3.8-flash` (check AI Studio for current free models).
  Free-tier prompts may be used by Google — only synthetic cases are sent.
- **Free and fast (tested 2026-10-20):** Groq — `PATIENT_PROVIDER=openai_compatible`,
  `OPENAI_COMPAT_BASE_URL=https://api.groq.com/openai/v1`, `OPENAI_COMPAT_MODEL=qwen/qwen3.8-27b`,
  `OPENAI_COMPAT_API_KEY=gsk_...`. Answers in ~0.5–2 s and stays close to the case wording;
  `openai/gpt-oss-120b`/`-20b` made factual errors in Mongolian. The free tier allows 8,000
  tokens/min (≈ one interview at a time); beyond that answers fall back to templates.
- **Paid later:** `PATIENT_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...`,
  `ANTHROPIC_MODEL` (defaults to `claude-opus-5-5`; a cheaper model can be set).
- **Local/open model:** run Ollama, `PATIENT_PROVIDER=openai_compatible`,
  `OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1`, `OPENAI_COMPAT_MODEL=qwen3:4b`.
- **Own fine-tuned model:** see `ml/README.md` and `inference/README.md`.

Redeploy (or restart `npm run dev`) after changing variables. If a provider is
misconfigured and the fallback is `mock`, the app runs in demo mode and says so.

## 6. Deploy the fine-tuned model

The model needs a GPU process separate from Vercel. Run `inference/server.py`
on a GPU host (free: Kaggle/Colab session + tunnel for demos; paid: always-on GPU
hosting), protect it with `API_KEY`, and set the `FINETUNED_*` variables in Vercel.
The adapter id in `FINETUNED_EXPECTED_ADAPTER` must equal the one in the
adapter's `pinequest_adapter.json`.

## 7. Tests and checks

```bash
npm run lint
npm run typecheck
npm test                     # Vitest: engine, evaluator, providers, API end-to-end
npm run build
npm run cases:validate
cd ml && .venv/bin/python -m pytest -q
```

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `SESSION_SECRET must be set...` on Vercel | Add a ≥32-char secret in Vercel env vars and redeploy. |
| `DATABASE_URL is required in production deployments.` | Set the Neon URL on Vercel. |
| Login works locally but not on Vercel | `APP_URL` / HTTPS: cookies are `Secure` in production; use the https URL. |
| `relation "users" does not exist` | Migrations not applied: `DATABASE_URL=... npm run db:migrate`. |
| Dashboard shows no cases | Seed or publish cases: `npm run db:seed`, or *Админ → Кейсүүд* status → Нийтлэгдсэн. |
| Patient always answers in demo mode | Check *Админ → AI загварын төлөв*; missing key or `429` quota → fallback. |
| Gemini `429` | Free-tier rate limit; wait or lower usage (`RATE_LIMIT_MESSAGES_PER_MINUTE`). |
| Fine-tuned answers recorded as fallback | `/health` adapter id or prompt format mismatch — retrain with the current prompt format or fix `FINETUNED_EXPECTED_ADAPTER`. |
| Local DB corrupted / want a reset | Stop the server, delete `.data/pglite`, `npm run setup`. |
| `next build` fails on Google Fonts download | The build machine needs internet access for `next/font/google`. |
