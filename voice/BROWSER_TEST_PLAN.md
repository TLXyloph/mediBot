# Browser Test Plan — MedCrew medic app (mic → backend bridge)

Goal: verify that the deployed medic app's **camera** and **"Talk to MedCrew" mic**
actually drive the Convex backend end-to-end — spoken/typed lines become
`utterance` events, the scribe extracts clinical data, questions are answered from
the backend's canonical `patientState`, and everything propagates to the reactive
`/medic` and `/hospital` views.

Scope of the change under test: `screens/src/app/page.tsx` + `screens/src/lib/clinical.ts`
(PR: "screens: bridge medic-app mic to the backend").

---

## 1. Environment

| Item | Value |
|---|---|
| App (local) | `http://localhost:3000` — from `screens/`: `npm install && npm run dev` |
| App (deployed) | Vercel project `screens` (get URL via `npx vercel ls` or the Vercel dashboard) |
| Backend | Convex `amicable-panther-654` (shared cloud; `NEXT_PUBLIC_CONVEX_URL` already set in `.env.local`) |
| Convex dashboard (optional, needs auth) | https://dashboard.convex.dev/d/amicable-panther-654 |
| Backend CLI check (optional) | from `brain/`: `npx convex run events:timeline '{}'` |

**Routes**
- `/` — medic app **(input under test: camera + mic)**
- `/medic` — ePCR + live timeline **(primary observer)**
- `/hospital` — vitals trend + SBAR card + red flag-flash **(observer)**
- `/monitor` — simulated cardiac monitor; cycles STABLE → HYPOTENSION → RESPONDING every 15s (camera target)

**Browser launch flags (only needed for the camera cases)**
```
--use-fake-ui-for-media-stream        # auto-grant camera/mic prompts
--use-fake-device-for-media-stream    # synthetic camera (test pattern; see TC7 note)
# For REAL vitals extraction instead of the test pattern:
--use-file-for-fake-video-capture=/absolute/path/monitor.y4m
```

---

## 2. Tester notes (read first — these prevent false failures)

1. **The mic can't be driven by speech in an automated browser.** The app uses the
   Web Speech API; in a headless/automated browser it yields no transcript and
   falls back to a **text input** labeled *"Voice input is unavailable. Type the
   same question."* (placeholder *"MedCrew, what are the latest vitals?"*, submit
   button **"Ask"**). **Use that text box** — it runs the exact same code path
   (`speakAnswer`) as the mic, so appends + answers are identical.
   - To reveal it: click **"Talk to MedCrew"**. If it flips to *"Stop listening"*
     but nothing happens, wait ~2s for the recognition error to surface the text box,
     or just reload — the box also appears on the next attempt.
2. **The backend is shared and append-only.** Other lanes/tests add events, and you
   cannot delete. Use **unique phrases** and scope every check to what *you just typed*.
3. **Safety-flag dedup.** A safety flag fires once per *unordered drug pair*. The
   shared deployment already has `aspirin+warfarin`, `ibuprofen+warfarin`,
   `naproxen+warfarin` flags. To see a **new** flag flash in TC4, use a
   not-yet-flagged antiplatelet/NSAID — e.g. **clopidogrel** or **ketorolac (Toradol)**.
4. **Latency budget:** allow up to ~3s for scribe extraction to appear, ~2s for
   reactive views to update.

---

## 3. Test cases

For each: perform steps on `/`, observe results (open `/medic` and `/hospital` in
separate tabs pointed at the same backend).

### TC1 — App loads and renders
1. Open `/`.
2. **Expect:** header "Convex live"; "Latest vitals" panel with HR / Oxygen / Pressure
   numbers; a "Monitor camera" preview card with **"Start monitor vision"**; a command
   bar with **"Talk to MedCrew"**; an answer card showing a sample question + answer text.
3. **Pass:** no console errors; all above visible.

### TC2 — Narration is charted (utterance → scribe → symptom) — CORE
1. On `/`, reveal the text box (see note 1). Type:
   `the patient is diaphoretic and short of breath` → **Ask**.
2. **Expect on `/`:** answer card shows *"Added to the record. Say "MedCrew" to ask a question."*
   (this line has no wake word, so it's charted, not answered).
3. **Expect on `/medic`** within ~3s: a new timeline `utterance` with that text, then
   `symptom` entries for **diaphoretic** and **short of breath** appear in the ePCR.
4. **Pass:** both symptoms show up, attributed to a source utterance.

### TC3 — Question is answered from patientState AND not charted — CORE
1. On `/`, type: `MedCrew, when was the last epi?` → **Ask**.
2. **Expect on `/`:** answer card updates with either *"The last epinephrine was
   recorded at HH:MM…"* or *"No epinephrine administration is recorded…"* — and the
   browser attempts to speak it (SpeechSynthesis).
3. **Expect on `/medic`:** a new `utterance` appears, but **NO** new
   `medication(epinephrine)` is created from it (the question is tagged and the scribe
   skips it — this is the anti-phantom guarantee).
4. **Pass:** answer shown; **zero** phantom medication from the question.

### TC4 — Safety hero beat, end-to-end
1. On `/`, type: `the patient takes warfarin` → **Ask**. (Charts a `medication(warfarin)`.)
2. Wait ~3s (let it extract). Then type: `giving the patient clopidogrel` → **Ask**.
   (Use clopidogrel/ketorolac per note 3, not aspirin/ibuprofen.)
3. **Expect on `/hospital`:** a red **flag flash** appears within ~5s; SBAR card's
   assessment/alerts mention the bleeding-risk conflict.
4. **Expect on `/medic`:** a `flag` entry with reason like *"Warning: clopidogrel with
   documented warfarin — bleeding risk."*
5. **Pass:** exactly one new safety flag for that pair; flash visible on `/hospital`.

### TC5 — Answer reflects the backend, not a stale client guess
1. On `/`, type: `MedCrew, what are the latest vitals?` → **Ask**.
2. **Expect:** answer names HR / oxygen / BP that match the "Latest vitals" panel and
   the `/hospital` trend (all sourced from the same Convex events).
3. **Pass:** numbers are consistent across `/`, `/hospital`, and the spoken answer.

### TC6 — Reactive propagation
1. Keep `/medic` and `/hospital` open. Submit any charted line from `/` (e.g. TC2).
2. **Expect:** the new event appears on `/medic` (< ~3s) and `/hospital` (< ~2s) with
   no manual refresh.
3. **Pass:** both views update live.

### TC7 — Camera regression (preview + frame POST)
1. Launch the browser with `--use-fake-ui-for-media-stream`. On `/`, click
   **"Start monitor vision"**.
2. **Expect:** camera permission auto-granted; preview activates; status cycles through
   *"Reading all four values"*; every 3s a `POST /api/vision/analyze` fires (check the
   network panel); button becomes **"Stop vision"**.
3. **Full-vitals (optional, needs a real monitor image):** either point a physical
   webcam at `/monitor` on a second screen, or launch with
   `--use-file-for-fake-video-capture=monitor.y4m`. **Expect:** status *"Vitals recorded
   to Convex"* and new `vital` events + an updated `/hospital` trend within ~5s.
4. **Pass (min):** preview activates and frames POST. **Pass (full):** vitals land in Convex.

### TC8 — Non-addressed narration UX
1. Type a plain statement without a wake word (e.g. TC2's line).
2. **Expect:** answer card shows *"Added to the record…"* (not an answer), but the line
   is still charted (verified by TC2).
3. **Pass:** correct message + still charted.

---

## 4. Verifying backend state (if UI observation isn't enough)

- **Primary (no auth):** watch `/medic` (timeline + ePCR) and `/hospital` (SBAR + flags).
- **Secondary (CLI):** from `brain/`, `npx convex run events:timeline '{}'` and grep for
  your unique phrase, its `refs`-linked agent events, and (for TC3) the absence of a
  phantom medication.

---

## 5. Reporting template

For each TC: **PASS / FAIL**, the exact text typed, what appeared on `/`, `/medic`,
`/hospital`, timing observed, and a screenshot. Flag any console errors, any phantom
medication from a question (TC3 must be zero), and any missing/late reactive updates.

**Overall gate:** TC2, TC3, TC4, TC6 must PASS (these are the integration's core claims).
