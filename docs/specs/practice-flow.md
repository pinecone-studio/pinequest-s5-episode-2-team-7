# Practice flow: role picker → 360° scene → voice interview → debrief

Status: approved 2026-10-25 · Deadline: 2026-10-30 (hackathon demo) · Team of 5

## Goal

Reframe the product as **«Эрүүл мэндийн мэргэжилтнүүдийн AI дадлагын орчин»**
(previously «Анагаахын оюутны дадлагын туслах») and give judges one smooth path:

```
/  «Та хэн бэ?» role picker
 → /practice/[scenarioId]  intro card + vitals strip + «Эхлэх»
 → 360° scene with hotspots (Өвчтөн / Монитор / Гэр бүлийн гишүүн)
 → Өвчтөн → existing interview page (voice conversation, unchanged)
 → existing diagnosis dialog
 → existing evaluation page + new «Шүүлэгч» section
```

All user-facing text is Mongolian (Cyrillic) and goes in `src/i18n/mn.ts`
(with an `en.ts` copy, as today).

## Constraints

- **Do not change the voice pipeline.** `workspace.tsx`, `call-view.tsx`,
  `recorder.ts`, `vad.ts`, `speech-player.ts`, `/api/speech/transcribe`, TTS and
  the avatar code are off-limits. The new flow only links to them.
- Do not change the disclosure pipeline (classifier → engine → context →
  provider → validator) or the case schema / DB tables.
- API calls from the browser go through `src/lib/api.ts`.
- `/demo` offline mode must keep working without a DB.
- Simple, working solutions over architecture. Only the critical flow is tested.

## Priority order

1. **P0 — main demo, end to end:** the ambulance chest-pain scenario
   (`ambulance-chest` → `chest-pain-01`), including the guest login, 360 scene,
   the interview, the debrief and the offline fallback. Nothing else starts
   until this one works on a phone.
2. **P1:** the other three scenarios (data, panoramas, family cards).
3. **P2 (nice to have):** the Өвчтөн hotspot opens the call as a full-screen
   layer over the 360 view instead of navigating away (see "Later").

## 1. Data: `data/scenarios.json`

A small, hand-editable overlay. Each scenario points at an existing case in
`data/cases/`, so the leak-safe patient, voice and rubric scoring are reused.
It holds **only public, presentational data** — never the diagnosis.

```jsonc
{
  "scenarios": [
    {
      "id": "ambulance-chest",
      "caseId": "chest-pain-01",
      "roles": ["ambulance", "student"],
      "title": "Цээжний өвдөлттэй 58 настай эрэгтэй",
      "intro": "Түргэн тусламжийн дуудлага. Таксины жолооч, өглөө машинаа халааж байхдаа цээжээр өвдсөн…",
      "vitals": { "heartRate": 104, "bloodPressure": "152/94", "spo2": 94, "respiratoryRate": 22, "temperatureC": 36.7, "gcs": 15 },
      "panorama": "/scenes/ambulance.jpg",
      "hotspots": {
        "patient": { "yaw": 0, "pitch": -10 },
        "monitor": { "yaw": 60, "pitch": 5 },
        "family":  { "yaw": -70, "pitch": 0 }
      },
      "family": { "who": "Эхнэр", "lines": ["…", "…", "…"] },
      "offline": true
    }
  ]
}
```

- `roles`: any of `"student" | "doctor" | "nurse" | "ambulance"`. **Оюутан sees
  every scenario** regardless of `roles`, so `"student"` in the list is optional.
- `vitals`: same keys as the case schema's `Vitals` plus `gcs` (ГКО, 3–15).
  Shown on the intro strip and the monitor. It overrides the case's
  `initialVitals` for display only.
- `yaw` / `pitch` are in degrees. Keep hotspots within ±30° pitch (AI skyboxes
  distort near the poles).
- `family.lines`: 3–5 short collateral-history lines. They may hint at
  history (e.g. "last month he got chest tightness on the stairs") but must
  **never name the diagnosis or a differential**.
- `offline`: only `true` for scenarios that have a script in
  `src/lib/demo/offline-cases.ts` (today only chest pain).

Loader + zod schema in `src/lib/scenarios.ts` (`listScenarios(role)`,
`getScenario(id)`), reading the JSON at build time (static import).

### The four scenarios

| id | Role | Case | Vitals (from the case's vitals fact) | Panorama |
|---|---|---|---|---|
| `ambulance-chest` (**P0**) | Түргэн тусламж | `chest-pain-01`, Батбаяр 58 | ЗЦ 104, АД 152/94, SpO₂ 94%, АТ 22, T 36.7, ГКО 15 | `/scenes/ambulance.jpg` |
| `er-abdomen` | Эмч | `abdominal-pain-01`, Сарангэрэл 24 | ЗЦ 102, АД 118/74, SpO₂ 99%, АТ 18, T 38.1, ГКО 15 | `/scenes/er.jpg` |
| `ward-dyspnea` | Сувилагч | `dyspnea-swelling-01`, Должинсүрэн 74 | ЗЦ 108, АД 172/96, SpO₂ 89%, АТ 26, T 36.6, ГКО 15 | `/scenes/ward-night.jpg` |
| `clinic-cough` | Оюутан | `cough-malaise-01`, Дорж 67 | ЗЦ 108, АД 126/78, SpO₂ 91%, АТ 26, T 38.6, ГКО 15 | `/scenes/clinic.jpg` |

Эмч uses `abdominal-pain-01` rather than `headache-01`: its rubric is more
complete (12 items / 4 critical vs 7 / 3; 24 facts vs 16).

### Panoramas

Equirectangular 2:1 JPEGs generated with a free AI skybox tool (e.g. Blockade
Labs Skybox), 4096×2048, ≤ 1.5 MB each, stored in `public/scenes/`. Prompts:
ambulance interior; emergency room bay; hospital ward at night; family health
centre consultation room (Mongolian setting where possible). Leave a clear area
near the horizon for each hotspot. Record the tool and prompt in
`public/scenes/ATTRIBUTION.md`.

**Fallback if a panorama looks bad:** use a flat 16:9 photo; the viewer still
works with the same hotspot JSON (smaller yaw range).

## 2. Landing and role picker (`/`)

- Replace the hero copy with the new framing (title above, one-line subtitle).
- «Та хэн бэ?» with four cards: **Оюутан / Эмч / Сувилагч / Түргэн тусламж**
  (icon + one line each).
- Choosing a role saves it in `localStorage` (`pq-role`, wrapped in try/catch)
  and shows that role's scenario cards (title, setting, difficulty badge). With
  one scenario, a single tap goes straight to it.
- The old dashboard, `/demo`, `/shuulleg`, `/atlas`, `/vr`, `/news` stay reachable from
  the site header. Logged-in users keep their session history at `/sessions`.

## 3. Guest access

`POST /api/auth/guest`:
- Creates a student user `guest-<random>` with a random unusable password hash
  and sets the normal iron-session cookie. If a session cookie already exists,
  reuses it.
- Rate-limited per IP with `src/lib/rate-limit.ts`.
- Every existing session/speech/avatar API then works unchanged (they all use
  `requireUser`).
- Client helper `ensureGuest()` in `src/lib/api.ts`: calls `/api/auth/me`,
  and if unauthenticated, `/api/auth/guest`.

## 4. Scenario screen (`/practice/[scenarioId]`)

Client page with two states.

**Intro (before «Эхлэх»):** intro card (title, setting, patient name/age,
intro text) and a vitals strip: ЗЦ · АД · SpO₂ · АТ · Т° · ГКО, with
abnormal values highlighted using the same ranges as `vitals-monitor.tsx`.

**«Эхлэх» tap — one user gesture does, in order:**
1. iOS motion permission: if `DeviceOrientationEvent.requestPermission` exists,
   call it (must be inside the tap handler). Denied → the scene still works by
   touch drag; show a small note «Хөдөлгөөн мэдрэгч унтраалттай — чирж харна уу».
2. `ensureGuest()`, then `POST /api/sessions { caseId }`. This also warms the
   model while the user looks around. Keep the returned session id.
3. Switch to the 360 view.

**360 view:** Photo Sphere Viewer (`@photo-sphere-viewer/core` +
`markers-plugin` + `gyroscope-plugin`, exact versions pinned), loaded with
`next/dynamic` and `ssr: false`. Gyroscope on by default when permitted, with a
toggle button. Hotspot markers are labelled pills with a pulse:

| Hotspot | Action |
|---|---|
| **Өвчтөн** | Navigate to the normal interview page for the session created in step 2 (`/interview/[id]`). Offline: `/demo/[caseId]`. |
| **Монитор** | Bottom sheet with the existing `vitals-monitor` fed from `scenario.vitals` + a ГКО tile. |
| **Гэр бүлийн гишүүн** | Bottom sheet card: `family.who` + `family.lines`. |

A «Буцах» button returns to the intro. The interview page itself is untouched;
it gets a small «360° үзэгдэл рүү буцах» link only if this can be done without
editing the voice components (a link in the page wrapper, not in `workspace.tsx`).

## 5. Debrief («Шүүлэгч», hybrid)

The existing evaluation stays the source of truth: **correct/incorrect**
(diagnosis match), **score /100** and **missed questions** (uncovered rubric
items with their `suggestedQuestion`). These are deterministic and also work
offline.

New on top of it:
- `POST /api/sessions/[id]/debrief` (auth as today): loads the transcript,
  the private case's diagnosis label and the missed rubric items **on the
  server**, and asks the configured model for JSON:
  `{ "summary": string, "followUps": string[2..3] }` in Mongolian. The
  follow-ups are questions for the learner to think about, e.g. "Энэ өвчтөнд
  яаралтай ямар шинжилгээ хийх вэ?"
- Validate with zod. Reject if not Mongolian (Cyrillic ratio check, as the
  validator does) or wrong shape. Timeout 8 s, 1 retry.
- **Fallback:** if the model fails, `followUps` = the first 3 missed items'
  `suggestedQuestion`, and `summary` = the existing narrative or a template
  sentence. The section is never empty.
- Result cached in `sessionStorage` per session id, so re-renders don't re-call.
- UI: a new «Шүүлэгч» card on the evaluation page **above** the existing report:
  verdict badge (Зөв / Буруу / Хэсэгчлэн зөв), score ring, missed questions,
  follow-up questions. Offline result page gets the same card with the
  fallback content.

## 6. Demo safety

- **Retry:** `ensureGuest` and `POST /api/sessions` retry twice with backoff
  (0.5 s, 1.5 s). Model replies already have retry/backup (PR #8, backup provider).
- **Offline fallback (P0 scenario only):** if `navigator.onLine` is false, or
  guest/session creation still fails after retries, the scenario switches to
  offline mode silently except for the existing offline badge: Өвчтөн goes to
  `/demo/chest-pain-01`-equivalent offline interview, and the debrief uses the
  fallback content. Panoramas and JSON are static, so the scene still loads.
- Scenarios with `offline: false` show «Сервертэй холбогдож чадсангүй. Дахин
  оролдох» with a retry button instead.
- **Rehearsal checklist** (day 4): airplane-mode run of `ambulance-chest`;
  iPhone Safari + Android Chrome gyroscope; cold model start (first reply ≤
  30 s with the warm-up).

## 7. Testing (critical flow only)

- `src/lib/scenarios.test.ts`: the JSON parses; every `caseId` exists in
  `data/cases`; every `panorama` file exists in `public/`; `offline: true` only
  where an offline script exists; `family.lines` contain none of the case's
  diagnosis/differential aliases.
- Guest endpoint: creates a user and the cookie authenticates `GET /api/sessions`.
- Debrief: model failure → fallback has 2–3 follow-ups from the rubric.
- One manual smoke run per scenario: role → intro → «Эхлэх» → scene → Өвчтөн →
  voice turn → diagnosis → debrief. P0 also run offline.
- `npm run check` stays green.

## File map

| New | Purpose |
|---|---|
| `data/scenarios.json` | the overlay (editable) |
| `src/lib/scenarios.ts` (+ `.test.ts`) | zod schema, loader, role filter |
| `src/app/api/auth/guest/route.ts` | guest login |
| `src/app/api/sessions/[id]/debrief/route.ts` + `src/lib/services/debrief.ts` | Шүүлэгч |
| `src/app/practice/[scenarioId]/page.tsx` | intro + 360 |
| `src/components/practice/role-picker.tsx` | «Та хэн бэ?» |
| `src/components/practice/intro-card.tsx`, `vitals-strip.tsx` | intro screen |
| `src/components/practice/panorama.tsx` | Photo Sphere Viewer + hotspots |
| `src/components/practice/debrief-card.tsx` | Шүүлэгч UI |
| `public/scenes/*.jpg`, `ATTRIBUTION.md` | panoramas |

| Edited (small) | Change |
|---|---|
| `src/app/page.tsx`, `src/components/landing/hero.tsx` | new framing + role picker |
| `src/i18n/mn.ts`, `en.ts` | strings |
| `src/lib/api.ts` | `ensureGuest`, `debrief` client calls |
| `src/app/sessions/[id]/page.tsx`, `src/components/demo/offline-result.tsx` | mount the debrief card |
| `src/components/site-header.tsx` | links to the old pages |

## Team split (suggested)

1. Data + guest endpoint + debrief API (`scenarios.json` for P0 first).
2. Panorama viewer, hotspots, gyroscope, iOS permission.
3. Landing, role picker, intro card, vitals strip, debrief card UI.
4. Generate the four skyboxes; write Mongolian intro + family text; native review.
5. Phone QA, offline rehearsal, demo script.

## Later (nice to have, only after P0 + P1 are solid)

- Өвчтөн opens the call as a full-screen layer over the 360 view, reusing the
  existing call component as-is (no voice-pipeline changes). If it needs any
  change inside the voice components, it does not ship.
- Hotspot positions editor (click on the panorama to print yaw/pitch).

## Out of scope

- A second AI voice for the family member.
- New case content or schema/DB changes.
- Changes to scoring weights or the evaluator.
