# Implementation plan: practice flow

Spec: [practice-flow.md](practice-flow.md) · Branch: `feature/practice-flow` · Deadline 2026-10-30

**Rules:** P0 (ambulance chest-pain, end to end, on a phone) before anything
else. Each task is under ~1 hour and ends with `npm run check` green and a commit.
No edits to the voice pipeline (`workspace.tsx`, `call-view.tsx`, `video-consult.tsx`,
`recorder.ts`, `vad.ts`, `speech-player.ts`, speech/TTS/avatar routes).

Legend: **[M]** must-have · **[N]** nice-to-have · 👤 = needs a teammate / phone / asset

---

## Phase P0: ambulance chest-pain, end to end

### A. Data

**A1 [M] Scenario schema + loader** (`src/lib/scenarios.ts`)
- zod schema per the spec: `id`, `caseId`, `roles[]`, `title`, `intro`,
  `vitals` (case `Vitals` keys + `gcs` 3–15), `panorama`, `hotspots.{patient,monitor,family}.{yaw,pitch}`,
  `family.{who,lines[3..5]}`, optional `offlineCaseId`.
- `listScenarios(role)` (`student` → all), `getScenario(id)`. Static JSON import.
- Done when: unit test parses a fixture and filters by role.

**A2 [M] `data/scenarios.json` with `ambulance-chest` only**
- Intro, vitals (ЗЦ 104, АД 152/94, SpO₂ 94, АТ 22, T 36.7, ГКО 15), family card
  (wife: 3–5 lines, no diagnosis words), placeholder hotspot angles,
  `offlineCaseId: "offline-chest-pain"`, panorama `/scenes/ambulance.jpg`.
- Temporary placeholder panorama (any 2:1 image) until P0-G1 lands.

**A3 [M] Scenario validity test** (`src/lib/scenarios.test.ts`)
- Every `caseId` exists in `data/cases/`; every `panorama` file exists in `public/`;
  `offlineCaseId` resolves via `findOfflineCase`; `family.lines` contain none of the
  case's `acceptedAliases` / `partialAliases` / differential aliases; hotspot pitch within ±30°.

### B. Guest access

**B1 [M] `POST /api/auth/guest`** (`src/app/api/auth/guest/route.ts` + `createGuestUser()` in `services/users.ts`)
- If the request already has a valid session → return it. Otherwise insert
  `{ name: "Зочин", email: "guest-<uuid>@guest.local", passwordHash: hash(random 32 bytes), role: "student" }`
  and set the cookie exactly like `register/route.ts`.
- Rate limit `guest:<clientKey>`, 10/min.
- Test in `tests/api.test.ts`: guest → `GET /api/sessions` 200; second call reuses the user.

**B2 [M] `ensureGuest()` + retry helper in `src/lib/api.ts`**
- `ensureGuest()`: `/api/auth/me` → if 401, `/api/auth/guest`.
- `withRetry(fn, [500, 1500])`, used for `ensureGuest` and `api.startSession`.

### C. Landing + role picker

**C1 [M] Strings** (`src/i18n/mn.ts` + `en.ts`): framing title/subtitle, «Та хэн бэ?»,
4 role labels + one-liners, intro/scene/hotspot/debrief/offline strings.

**C2 [M] Role picker** (`src/components/practice/role-picker.tsx`)
- 4 cards (Оюутан / Эмч / Сувилагч / Түргэн тусламж, lucide icons). Selection saved to
  `localStorage["pq-role"]` (try/catch). Shows the role's scenario cards → link to
  `/practice/[id]`. One scenario → still a card (one tap).

**C3 [M] New landing** (`src/app/page.tsx`, `landing/hero.tsx`)
- Hero copy → new framing; role picker right below the hero (above "how it works").
  Landing no longer requires login; logged-in users still see a «Миний түүх» link.

**C4 [M] Header links** (`site-header.tsx`): keep dashboard, `/demo`, `/shuulleg`,
`/atlas`, `/vr`, `/news` reachable (a «Бусад» menu on mobile is fine).

### D. Intro screen

**D1 [M] Route + intro card** (`src/app/practice/[scenarioId]/page.tsx`, `practice/intro-card.tsx`)
- Server page: `getScenario` (404 if missing) + the case's `PublicCase` (name, age,
  setting) → client component `<PracticeScenario>` with state `intro | scene`.

**D2 [M] Vitals strip** (`practice/vitals-strip.tsx`)
- ЗЦ · АД · SpO₂ · АТ · Т° · ГКО; reuse the abnormal ranges by exporting `abnormal`
  from `vitals-monitor.tsx` (export only, no behaviour change). ГКО < 15 = abnormal.
  Wraps to 3×2 on phones.

**D3 [M] «Эхлэх» handler**
- In the tap handler, in this order: iOS `DeviceOrientationEvent.requestPermission?.()`
  (store granted/denied), `withRetry(ensureGuest)`, `withRetry(api.startSession(caseId))`
  → keep `sessionId`; on final failure → offline mode if `offlineCaseId`, else
  the «Дахин оролдох» error card. `navigator.onLine === false` → offline straight away.
- Button shows a spinner; double taps are ignored.

### E. 360 scene

**E1 [M] Install + viewer** (`practice/panorama.tsx`)
- `npm i` exact pinned `@photo-sphere-viewer/core`, `markers-plugin`, `gyroscope-plugin`
  (+ their CSS). `next/dynamic(..., { ssr: false })`. Full-viewport, `touch-action: none`,
  destroy on unmount.

**E2 [M] Hotspot markers**
- HTML markers from `scenario.hotspots`: labelled pill + pulse ring, ≥ 44 px tap target.
  Click → `onHotspot("patient" | "monitor" | "family")`.

**E3 [M] Gyroscope**
- Enable when permission granted (or not required on Android); toggle button
  top-right. Denied → note «Хөдөлгөөн мэдрэгч унтраалттай — чирж харна уу».

**E4 [M] Hotspot actions**
- Өвчтөн → `router.push(/interview/${sessionId})`, offline → `/demo/${offlineCaseId}`.
- Монитор → bottom sheet with the existing `VitalsMonitor` + ГКО tile.
- Гэр бүлийн гишүүн → bottom sheet with `family.who` + lines.
- «Буцах» → intro.

**E5 [M] 👤 Hotspot angle helper (dev only)**
- `?debug=1` logs yaw/pitch on click so the team can place hotspots on the
  real panorama in minutes.

### F. Debrief («Шүүлэгч»)

**F1 [M] Fallback builder** (`src/lib/evaluation/debrief.ts`, pure, client-safe)
- `fallbackDebrief(result: EvaluationResult)` → `{ verdict, score, missed[], followUps[2..3], summary, source: "rubric" }`
  from the existing evaluation (`suggestedQuestion` of missed items, critical first).
- Unit test: always 2–3 follow-ups, even with no missed items (generic questions).

**F2 [M] Model call** (`src/lib/services/debrief.ts` + `POST /api/sessions/[id]/debrief`)
- Server loads the transcript, private diagnosis label and missed items; prompts the
  configured `ChatModelProvider` (same as `narrative.ts`) for JSON
  `{ summary, followUps }`. zod + Cyrillic check, 8 s timeout, 1 retry → else `fallbackDebrief`.
- Test: provider throws → response equals the fallback shape.

**F3 [M] Debrief card** (`practice/debrief-card.tsx`)
- Verdict badge (Зөв / Хэсэгчлэн зөв / Буруу from the diagnosis match), score ring
  (existing `ScoreRing`), missed questions, follow-up questions; skeleton while loading;
  `sessionStorage` cache per session id.
- Mounted above `EvaluationReport` in `src/app/sessions/[id]/page.tsx`.

**F4 [M] Offline debrief**: mount the card in `offline-result.tsx` with `fallbackDebrief` only.

### G. Assets + phone QA (P0)

**G1 [M] 👤 Ambulance panorama**: generate the skybox, 4096×2048 JPEG ≤ 1.5 MB →
`public/scenes/ambulance.jpg`, record tool/prompt in `public/scenes/ATTRIBUTION.md`.
Place hotspots with E5.

**G2 [M] 👤 Mongolian review** of the ambulance intro + family lines by a native speaker.

**G3 [M] 👤 Phone pass** on a Vercel preview: iPhone Safari (motion permission prompt),
Android Chrome, laptop. Role → intro → Эхлэх → scene → each hotspot → voice turn →
diagnosis → debrief. Fix layout issues found.

**G4 [M] 👤 Offline rehearsal**: server/model unreachable (stop the server, or the
`?offline=1` dev switch) → scene → offline interview → offline debrief. Airplane
mode after the intro loads keeps the scene working (viewer code + panorama are
preloaded), but opening the offline interview still needs the network until a
service worker (PWA roadmap) caches `/demo/*`.

**✅ P0 gate:** G3 and G4 pass. Only then start P1.

---

## Phase P1: the other three scenarios

Per scenario: data entry → panorama → hotspot placement → Mongolian review → phone smoke run.

| Task | Scenario | Role | Case |
|---|---|---|---|
| **H1 [M]** | `er-abdomen` | Эмч | `abdominal-pain-01` |
| **H2 [M]** | `ward-dyspnea` | Сувилагч | `dyspnea-swelling-01` |
| **H3 [M]** | `clinic-cough` | Оюутан | `cough-malaise-01` |

Each H task = add the entry to `scenarios.json` (A3 test must pass), 👤 generate +
add the panorama, place hotspots, review text. No offline script for these:
check that the «Дахин оролдох» card shows when the server is down.

**H4 [M] 👤 Full regression**: one smoke run per scenario per role on a phone;
`/demo`, `/dashboard`, the interview's voice turn still work as before.

---

## Phase P2: nice-to-have (only after P1 is done)

- **N1 [N] Call as a full-screen layer over the 360 view**: reuse the existing call
  component unchanged; ships only if it needs zero edits inside voice components.
- **N2 [N]** «360° үзэгдэл рүү буцах» link on the interview page wrapper (not `workspace.tsx`).
- **N3 [N]** Preload the panorama on the intro screen (`<link rel="preload">`).
- **N4 [N]** Monitor alarm tone for abnormal SpO₂ (muted by default).
- **N5 [N]** Hotspot editor: click the panorama → copy JSON snippet.

---

## Suggested schedule

| Day | Dev 1 (data/API) | Dev 2 (360) | Dev 3 (UI) | 4 (content) | 5 (QA) |
|---|---|---|---|---|---|
| Oct 25–26 | A1–A3, B1–B2 | E1–E3 | C1–C4, D1–D2 | G1, G2 | device list, preview URL |
| Oct 27 | F1–F2 | D3, E4–E5 | F3–F4 | panoramas for H1–H3 | **G3, G4 (P0 gate)** |
| Oct 28 | H1–H3 data | fixes | fixes | H1–H3 text review | H4 |
| Oct 29 | buffer / N1–N3 | buffer | buffer | demo script | rehearsal |
| Oct 30 | **demo**: deploy frozen by morning | | | | |

## Risks to watch

- **Panorama quality** → flat-image fallback, same JSON.
- **Cold model start** on the first reply → «Эхлэх» starts the session (warm-up) before the scene.
- **Guest users pile up in Neon** → harmless for the demo; a cleanup script is out of scope.
- **iOS motion permission** is only testable on a real iPhone over HTTPS → G3 on day 3, not day 5.
