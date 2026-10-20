# PineQuest AI Patient — Mongolian AI Patient Simulator

An educational web application where Mongolian medical students practise
clinical **history-taking** and **diagnostic reasoning** by interviewing an AI
that behaves like a real patient. The patient reveals only what is asked,
answers in natural Mongolian, and never discloses its hidden diagnosis. When
the student submits a diagnosis, the app scores both the diagnosis and the
quality of the interview against a case-specific rubric.

> ⚠️ Educational simulation only. Not for diagnosing or treating real patients.

## Status

Work in progress — see the development history in git. This README is updated
at every milestone.

| Area | Status |
| --- | --- |
| Project foundation (Next.js 16, TypeScript, Tailwind 4) | ✅ |
| Everything else | 🚧 in progress |

## Quick start (local)

```bash
npm install
cp .env.example .env     # then set SESSION_SECRET (32+ chars)
npm run dev
```

## Licence

Code: to be decided by the project team. Demonstration cases are synthetic.
