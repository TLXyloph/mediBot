# MediBot — Scope & Build Plan

Hack with VoiceOS · Frontier Tower SF · Sun Aug 9 2026 · **pitch 6:00 PM, live demo is 60 seconds** · team of 4.
Plan page: https://claude.ai/code/artifact/0f913dab-cd6f-46de-818c-a8b8f907bea2

## Product summary

An ambient AI crew member for paramedics. It listens to the whole scene and writes the ePCR in real time, keeps live eyes on the cardiac monitor through a streaming Gemini session, speaks protocol callouts and answers questions by voice, and streams a live SBAR handoff to the hospital before the ambulance arrives. Everything is derived from one append-only event log in Convex.

## Goals (locked)

- Win on demo quality: **two consecutive clean 60-second scripted runs before 5:30 PM**, backup video recorded by 5:15 PM.
- Voice-only operation on the host's tech: every MediBot control action in the demo is spoken, none typed. **Verify:** full demo run touches no keyboard after launch.
- Deep sponsor usage: VoiceOS (interface), Convex (reactive event spine). **Verify:** each is load-bearing in the demo, not decorative.

## Non-goals (v1 / today)

- No Lightberry/robot (hardware unavailable). No acoustic diarization (role attribution is LLM content-based). No full NEMSIS XML export (field *mapping* only). No auth, no offline mode, no real hospital integration, no Vertex/GCP setup (Gemini via AI Studio key only).

## Constraints & decisions

- **Deadline:** demo freeze 5:30 PM. Demo hard cap 60 seconds.
- **Hardware:** 4 MacBooks, 1 Samsung phone, 3 iPhones, 1 mic wired to a speaker. Map: MB1 medic app + VoiceOS + mic/speaker · MB2 hospital screen · MB3 Gemini Live page, webcam facing the Samsung phone playing the simulated monitor loop · MB4 spare/dev · iPhones: patient script + backup-video camera.
- **Two-plane voice architecture:** VoiceOS (Mac SDK, premium sub — no server API) is the **control plane**: spoken commands operate MediBot. Ambient transcription-of-record (**data plane**) defaults to a dedicated Gemini Live "ears" session (audio in, input transcription on, no audio out) unless task A1 finds the VoiceOS SDK exposes a continuous transcript stream.
- **Protocol callouts are deterministic:** state-machine timers → TTS. Gemini/LLMs never own timing. Demo-mode clock runs timers at 4× (rhythm check q30s) so a callout lands inside 60s.
- **Decoupling rule:** each lane owns exactly one directory (below) and nobody edits another lane's directory before Phase 2. `screens/` and `eyes/` call Convex by **string function names (`anyApi`)**, not generated types — zero shared files between lanes, zero merge conflicts. Rationale: we trade type safety for parallel speed today.
- **Secrets:** keys live in per-directory `.env` files (gitignored) and in Convex env vars for agents (`npx convex env set GEMINI_API_KEY ...`). Never commit keys; never put keys in client code you screen-share.
- **Models — all-Gemini (decided ~12:25, team has a paid key):** one provider, one SDK (`@google/genai`), one key. Agents: latest Flash (`gemini-3.1-flash`, else `gemini-2.5-flash`) with structured output. Perceptual + ears channels: `gemini-3.1-flash-live-preview` (GA fallback `gemini-2.5-flash` native audio). Callout TTS: Gemini TTS, with macOS `say` as the zero-dependency fallback. **Insurance:** lane B calls models only through a ~5-line `llm()` wrapper with an `LLM_PROVIDER` env flag, so flipping any agent to OpenAI later is config, not code.
- **Prize-optics note, accepted:** the prize pool is OpenAI credits and our stack no longer uses OpenAI. We're betting demo quality outweighs stack politics; the `llm()` wrapper keeps the flip open if we change our minds before 5:30.

## The contract (everything couples through this, nothing else)

Convex table `events`, append-only:

```
{ ts, type, source, role, payload, conf, refs }

type:   utterance | vital | intervention | medication | symptom |
        correction | flag | protocol_state | timer | sbar_update
source: voice | vision | agent | system
role:   medic | patient | partner | bystander
```

ePCR, SBAR, and both dashboards are derived views over this log. Agents read the log and append. **Nobody mutates or deletes events, ever.** Corrections are new events referencing the corrected one via `refs`.

## Repo layout — one lane per person, claim yours in the group chat

| Dir | Lane | Mission |
|---|---|---|
| `voice/` | A | Voice I/O — VoiceOS control plane, ambient ASR data plane, TTS out |
| `brain/` | B | Convex project — schema, agents, protocol state machine |
| `screens/` | C | Medic view + hospital view (two web apps or two routes) |
| `eyes/` | D | Gemini Live watcher page + simulated monitor + demo assets |

## Locked requirements

- **R1 — Ambient capture.** Speech near the mic becomes `utterance` events. **Verification:** speak one sentence; a row with `ts` and text appears in the Convex dashboard within 3s.
- **R2 — Role attribution.** Utterances carry `role`. **Verification:** patient-scripted line "chest hurts… I take warfarin" yields `symptom` + `medication` events with `role: patient`.
- **R3 — Live extraction latency.** Utterance → field visible on medic view in **< 3s p95** across a rehearsal run.
- **R4 — Safety agent.** Documented med conflicting with stated meds/history triggers a `flag` event AND a spoken alert. **Verification:** scripted aspirin-after-warfarin beat fires both within 5s.
- **R5 — Gap agent.** A missing required field (e.g., age) is asked for by voice within 30s of protocol start, never during an intervention utterance burst.
- **R6 — Protocol timers.** In demo mode, rhythm-check callout at 30s ± 2s after arrest protocol start; epi timer analogous. **Verification:** stopwatch during rehearsal.
- **R7 — Provenance.** Every populated ePCR field exposes its source utterance text + timestamp on click/tap.
- **R8 — Non-destructive corrections.** "Correction — BP 90 over 60" appends a `correction` event; UI shows amended value with audit trail; original event still queryable.
- **R9 — Hospital reactivity.** Event appended on MB1 renders on MB2's hospital view in **< 2s** (Convex reactive query, no polling).
- **R10 — Vision vitals.** Simulated monitor value change → `vital` event in **< 5s** (`report_vitals` tool call from the Live session).
- **R11 — Spoken Q&A.** "MediBot, when was the last epi?" → audible answer begins in **< 2.5s**, content sourced from `query_patient_state`.
- **R12 — Voice-only control.** Corrections, queries, and time-marks are all VoiceOS-spoken commands. **Verification:** demo run uses no keyboard after app launch.
- **R13 — Demo readiness.** Two consecutive clean 60s runs before 5:30; backup video recorded by 5:15.

## Phased build plan

### Phase 0 — Contract (NOW – 12:45, all four together)
- Claim lanes in group chat. **Done when:** four names next to four dirs.
- `brain/`: init Convex project, create `events` table + `append` mutation + `timeline` query. **Done when:** `npx convex dev` runs and a hand-inserted test event shows in the dashboard.
- Share Convex deployment URL + the Gemini key into each lane's `.env` (and `npx convex env set GEMINI_API_KEY` for agents). **Done when:** all four can insert a test event from their own machine.

### Phase 1 — Lanes in parallel (12:45 – 3:30). Each block below is self-contained; pick yours up independently.

**Lane A — `voice/` (Voice I/O)**
- A1. 15-min timebox: does the VoiceOS SDK expose a continuous transcript stream? Post the verdict in chat. **Done when:** data-plane decision (VoiceOS vs Gemini Live "ears" session) is posted.
- A2. Ambient ASR → `utterance` events via chosen data plane. **Done when:** talking near the mic produces live rows (R1).
- A3. VoiceOS command grammar: "correction — …", "MediBot, mark <thing>", "MediBot, <question>" (questions route to a `question` payload event that `eyes/` answers, or directly to eyes' session if simpler). **Done when:** each spoken command produces its event type (R12).
- A4. TTS output channel: subscribe to `flag` + `timer` events → speak them. **Done when:** hand-inserting a flag event causes a spoken alert < 2s (feeds R4/R6).

**Lane B — `brain/` (Convex + agents)**
- B1. Schema + append mutation + queries: `timeline`, `epcr` (derived fields), `sbar`, `patientState` (meds/allergies/last-epi/protocol position). **Done when:** queries return correct derivations for a hand-built event sequence.
- B2. Scribe agent (Gemini Flash via the `llm()` wrapper): on `utterance` → role attribution + extraction → typed events. **Done when:** R2 passes on the scripted line, < 3s (R3).
- B3. Safety agent: on `medication`/`intervention` → check vs `patientState` → `flag`. **Done when:** R4's scripted conflict fires.
- B4. Protocol state machine + timers with `DEMO_CLOCK=4x` env flag → `timer` events. **Done when:** R6 stopwatch check passes.
- B5. Gap agent (quiet-moment heuristic: no utterance for N seconds) + SBAR agent maintaining `sbar_update` events. **Done when:** R5 passes; `sbar` query reflects the latest events.

**Lane C — `screens/` (two views)**
- C1. Medic view: live ePCR panel + scrolling timeline, reactive Convex queries by string name (`anyApi`). **Done when:** hand-inserted event renders < 2s.
- C2. Completeness meter + provenance popover (field → source utterance + ts). **Done when:** R7 passes.
- C3. Hospital view: vitals trend chart, interventions list, live SBAR card, visual flash on new `flag`. **Done when:** R9 passes across two machines.
- C4. Projector polish: large type, high contrast, works full-screen on MB2. **Done when:** legible from 3m away.

**Lane D — `eyes/` (Gemini Live + demo assets)**
- D1. Live page (`@google/genai`, client→server WS): webcam + mic in, native audio out, system prompt = silent unless addressed "MediBot". **Done when:** 5-minute session stays connected and answers only when addressed.
- D2. Tools: `report_vitals` → Convex append; `query_patient_state` → Convex query → spoken answer. **Done when:** R10 and R11 pass.
- D3. Simulated monitor: looping page/video on the Samsung with visibly changing HR/SpO₂/BP. **Done when:** camera-visible value changes occur at least every 20s.
- D4. Fallback flag: 3s frame-poll (`generateContent` + image) emitting the same events. **Done when:** with Live disabled, vitals still flow.
- D5. Demo kit: printed 60s script + beat cards, camera rig for the Samsung, owns recording at 4:30. **Done when:** script printed, rig stable, record plan agreed.

### Phase 2 — Integration (3:30 – 4:30, all four)
- Run the 60s script end-to-end on the real hardware map. **Done when:** every beat produces its expected events and screen/audio outputs once.
- Fix seams in priority order: R1→R3→R4→R9→R10→R11 (drop R5 first if time-boxed).

### Phase 3 — Rehearse & freeze (4:30 – 5:30)
- 4:30 record backup video during first full run (this is also the Best Video Demo entry). **Done when:** watchable 60s video exists by 5:15.
- Rehearse until two consecutive clean runs (R13). **Done when:** R13 passes.
- 5:30 freeze. Write pitch beats; file real VoiceOS feedback (Best VoiceOS Feedback prize).

### 60-second demo script (one teammate plays patient)
1. 0–15s — ambient scene; patient: "chest hurts… I take warfarin" → chart fills itself, role-attributed.
2. 15–25s — gesture at camera rig: vitals have been logging themselves off the monitor the whole time.
3. 25–35s — "giving aspirin" → safety agent interrupts aloud (warfarin + GI-bleed).
4. 35–45s — "MediBot, when was the last epi?" → Gemini Live answers by voice.
5. 45–60s — reveal MB2: SBAR already waiting, vitals trending. Close.
(Voice-correction beat lives in the backup video only.)

## Open questions & risks

- **VoiceOS transcript stream?** Unknown until A1's 15-min check. Fallback (Gemini Live "ears" session) is pre-decided, so this can't block longer than 15 minutes.
- **TTS audibility:** MediBot speaks from a MacBook; the mic→speaker rig is for the room. Test routing MB1 audio out to the speaker at Phase 2; fallback = hold mic to laptop.
- **Camera stability:** no tripod — prop the Samsung + webcam rig and mark positions with tape before rehearsal.
- **Venue wifi:** Convex + Live API + Realtime all need network. Test on venue wifi at Phase 0; fallback = iPhone hotspot (test that too).
- **Single-provider concentration:** everything now rides one paid Gemini key. Mitigations: the `llm()` wrapper (flip agents to another provider by env flag), macOS `say` for callout TTS, and D1 must confirm **two concurrent Live sessions** (ears + eyes) run stably for 5 min on this key — check this at 1:00, not at rehearsal.
