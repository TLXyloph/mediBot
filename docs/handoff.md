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
- **Two-plane voice architecture — RESOLVED (A1, ~1:00):** VoiceOS exposes **no continuous transcript stream** (push-to-talk/hands-free dictation; transcripts land in its SQLite only after a session ends). Data plane = the dedicated Gemini Live "ears" session — running on `gemini-3.1-flash-live-preview`, which is **AUDIO-modality-only** (TEXT rejected on our key); model output is discarded. VoiceOS remains the control plane via a local-MCP integration (`voice/voiceos-integration/`): its agent routes spoken commands to tools `medibot_correction` / `medibot_mark` / `medibot_ask` → `POST 127.0.0.1:4750/command` → events. The same commands also parse straight from the ambient transcript, so R12 holds even without the VoiceOS hop.
- **Wake word is "Scribe" (renamed ~2:20 PM):** ASR only spells real dictionary words reliably — "MediBot" transcribed as Metabott/Merbau/Netbot in live testing. voice/ wakes on "Scribe" (exact match, env `WAKE_NAME`) and still catches MediBot manglings as a fallback. **eyes/ D1's system prompt and the pitch script must adopt "Scribe" too.**
- **Protocol callouts are deterministic:** state-machine timers → TTS. Gemini/LLMs never own timing. Demo-mode clock runs timers at 4× (rhythm check q30s) so a callout lands inside 60s.
- **Decoupling rule:** each lane owns exactly one directory (below) and nobody edits another lane's directory before Phase 2. `screens/` and `eyes/` call Convex by **string function names (`anyApi`)**, not generated types — zero shared files between lanes, zero merge conflicts. Rationale: we trade type safety for parallel speed today.
- **Secrets:** keys live in per-directory `.env` files (gitignored) and in Convex env vars for agents (`npx convex env set GEMINI_API_KEY ...`). Never commit keys; never put keys in client code you screen-share.
- **Models — all-Gemini (decided ~12:25, team has a paid key):** one provider, one SDK (`@google/genai`), one key. Agents: latest Flash (`gemini-3.1-flash`, else `gemini-2.5-flash`) with structured output. Perceptual + ears channels: `gemini-3.1-flash-live-preview` (GA fallback `gemini-2.5-flash` native audio). Callout TTS (**measured on our key: 1.9–4s per synthesis — too slow to gate an alert on**): macOS `say` speaks immediately while the Gemini TTS wav warms in a background cache, so repeated callouts (timers) get the premium voice at zero latency. **Insurance:** lane B calls models only through a ~5-line `llm()` wrapper with an `LLM_PROVIDER` env flag, so flipping any agent to OpenAI later is config, not code.
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

**Validator facts (verified against brain/'s deployed code — read before writing an anyApi caller):**

- `role`, `conf`, `refs`, `ts` are `v.optional(...)`: **omit them when unset — an explicit `null` is rejected** and the append fails.
- `events:append` args: `{ts?, type, source, role?, payload, conf?, refs?}`. Public `append` auto-schedules the scribe on `utterance` events (and only those). `events:timeline` takes `{since?, limit?}` and returns a row array.
- Payload conventions: spoken questions arrive as `utterance` events with `payload.question` (eyes/ answers them); `flag`/`timer` events should carry speakable text in `payload.say` or `payload.text` (voice/ speaks either, else a generic line); ambient utterances may include `payload.speaker` (`spk_N` hint from Gemini) for the scribe.

## Repo layout — one lane per person, claim yours in the group chat

| Dir | Lane | Mission |
|---|---|---|
| `voice/` | A | Voice I/O — VoiceOS control plane, ambient ASR data plane, TTS out |
| `brain/` | B | Convex project — schema, agents, protocol state machine |
| `screens/` | C | Medic view + hospital view (two web apps or two routes) |
| `eyes/` | D | Gemini Live watcher page + simulated monitor + demo assets |

## Git workflow — branches per phase, worktrees per parallel agent

- **Phase 0 → straight to `main`.** The contract (schema, dirs, this doc) must be pullable by everyone immediately.
- **Phase 1 → one branch per lane:** `p1-voice`, `p1-brain`, `p1-screens`, `p1-eyes`. All work — yours or your AI agent's — happens on your lane branch, only inside your lane directory. Push to origin every ~30 min (laptop-dies insurance). **Merge all four to `main` at 3:30.** Directory ownership makes these merges conflict-free by construction; the branches exist so half-broken WIP never blocks another lane pulling `main`.
- **Phase 2 → `p2-integration`**, branched from `main` after the 3:30 merges. Cross-lane edits are allowed here and only here. Merge to `main` at 4:30, when the end-to-end scripted run has passed once.
- **Phase 3 → freeze:** tag `demo-freeze` on `main` at 5:30. After the tag nothing merges without all four agreeing; emergency fix = `p3-hotfix` branch, then re-tag.
- **AI-agent rules (Claude Code and friends):** an agent session runs on your lane branch and may only modify files inside your lane directory. Running two or more agents in parallel on one machine: give each its own worktree + sub-branch so they never share a checkout — `git worktree add ../mediBot-eyes-monitor p1-eyes-monitor` (Claude Code's built-in worktree isolation does the same automatically). Small frequent commits, no force-pushes ever, `.env` never staged.
- **The demo runs from the tag:** at 5:30, `git checkout demo-freeze` on MB1/MB2/MB3 so every machine runs identical code.
- **Status ~1:45 PM: all four lane branches are already merged to `main`** (ahead of the 3:30 plan). Work continues on `main` with commits scoped to your own lane dir; cross-lane fixes are now Phase-2 fair game. The 5:30 `demo-freeze` tag plan stands.

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

### Phase 1 — Lanes in parallel (12:45 – 3:30). Each block below is self-contained; pick yours up independently on your `p1-<lane>` branch (see Git workflow above).

**Lane A — `voice/` (Voice I/O) — ✅ BUILT, merged to `main`**
- A1 ✅ No VoiceOS transcript stream → Gemini Live ears session is the data plane (see Constraints).
- A2 ✅ `cd voice && npm run dev`: mic (sox or ffmpeg) → ears session → `utterance` events. R1 verified live on the team key. Keyless dev: `npm run fake`; key sanity-check: `npm run check:gemini -- --tts`.
- A3 ✅ Command grammar ("correction — …", "Scribe, mark …", "Scribe, <question>") parses from the ambient transcript AND ships as VoiceOS MCP tools (`voice/voiceos-integration/`) hitting `POST 127.0.0.1:4750/command`. All three kinds verified → correct event types. App-side install of the integration is the one open item (see Open questions).
- A4 ✅ `flag`/`timer` → spoken alert < 2s, verified via `npm run insert:flag` / `insert:timer`. Reactive Convex subscription with 500ms polling fallback; local JSONL mode when `CONVEX_URL` is unset. Remaining: put the shared `CONVEX_URL` into `voice/.env`.

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
- **Status ~3:00 PM — software integration DONE (audited all lanes, fixed seams):**
  - Live-verified: append→scribe→typed events (<1s), safety flag→spoken alert, gap agent, protocol timers @4×, epcr/patientState/sbar/timeline queries, `protocol.stop` (call it between rehearsals!).
  - Fixed in eyes/: `patientState:patientState` fn name (R11 threw), Scribe wake-gate (answers were being discarded — ASR can't spell "MediBot"), per-vital `{name,value}` events (R10 was invisible on screens/SBAR), medication-object normalizer.
  - Fixed in brain/: strict runId tick guard (R6 timing), `payload.say` on safety flags (R4 beat now speaks the actual conflict). **⚠ Lane B must redeploy** (`npx convex dev`) to push these live.
  - screens/ (read-only, human working): R9 reactive ✓; gap list handed over — R7 popover must follow `refs` to the source utterance; SBAR card → `sbar.sbar`; needs `NEXT_PUBLIC_CONVEX_URL` in `.env.local`.
  - Still hardware-only: camera rig → R10 live check, ears+eyes two-session soak, MB2 hospital screen run, MB1 audio → room speaker.

**Lane D — camera bring-up, do this now (~3:55 PM; written for D's agent):**

1. **Pull `main` first and restart any running eyes server** — eyes/ received Phase-2 fixes you must not re-litigate: `patientState:patientState` function name (R11 threw before), answer-playback wake gate accepts **"Scribe"** (+"MediBot" legacy; ASR cannot spell MediBot — do not revert), vitals emit **per-vital `{name: hr|spo2|sbp|dbp, value}` events sharing one ts** (contract shape; the old combined payload was invisible to screens/sbar), patientState normalizer accepts brain's medication objects, dotenv anchored to `eyes/.env`, `.env.example` corrected (its old `CONVEX_PATIENT_STATE_FUNCTION` value re-breaks R11 if copied).
2. Setup: `cd eyes && cp .env.example .env`, fill `GEMINI_API_KEY` (team key) + `CONVEX_URL` (same value screens/ uses). Leave the commented overrides commented. `npm run dev`, then `curl localhost:3000/api/health` → expect `geminiConfigured:true, convexConfigured:true, convexMode:"live"`.
3. Monitor: open `http://<MB3-ip>:3000/monitor` on the Samsung (values cycle every 15s). Prop the webcam on it, tape the positions.
4. **R10 check:** live page running, camera on the monitor → within **5s** of an on-screen value change, four `vital` events (`source: vision`) land in Convex. Verify via the Convex dashboard data page, or from any checkout: `cd voice && npm install && printf 'CONVEX_URL=<url>\n' > .env && npm run tail -- 5` (the tail reader needs only the URL, no Gemini key).
5. **R11 check:** say **"Scribe, when was the last epi?"** at MB3's mic → spoken answer starts < 2.5s. (Answer content is test-junk until the pre-rehearsal log reset — verify mechanics now, content later.) Unaddressed room talk must stay silent.
6. Fallback: **Force fallback** button → vitals keep flowing via the 3s poll (R10 insurance).
7. **Two-session soak (coordinate with lane A):** once your Live session is stable, say so in chat — MB1 runs the ears session alongside for 5 min; both sides watch for reconnect churn (the one-key concentration risk). Report churn or clean.
8. Report in chat: R10 latency, R11 latency, any session drops. Your `DEMO_RUNBOOK.md` spoken cues were already renamed to "Scribe".

### Phase 3 — Rehearse & freeze (4:30 – 5:30)
- 4:30 record backup video during first full run (this is also the Best Video Demo entry). **Done when:** watchable 60s video exists by 5:15.
- Rehearse until two consecutive clean runs (R13). **Done when:** R13 passes.
- 5:30 freeze. Write pitch beats; file real VoiceOS feedback (Best VoiceOS Feedback prize).

### 60-second demo script (one teammate plays patient)
1. 0–15s — ambient scene; patient: "chest hurts… I take warfarin" → chart fills itself, role-attributed.
2. 15–25s — gesture at camera rig: vitals have been logging themselves off the monitor the whole time.
3. 25–35s — "giving aspirin" → safety agent interrupts aloud (warfarin + GI-bleed).
4. 35–45s — "Scribe, when was the last epi?" → Gemini Live answers by voice. (Wake word renamed from MediBot — ASR reliability; see Constraints.)
5. 45–60s — reveal MB2: SBAR already waiting, vitals trending. Close.
(Voice-correction beat lives in the backup video only.)

## Open questions & risks

- ~~VoiceOS transcript stream?~~ **Resolved: none exists** → ears session is the data plane, running.
- **VoiceOS integration install (open — and prime Best-VoiceOS-Feedback material):** the documented `Settings → Agent Mode → Integrations` path doesn't exist in 0.1.21; the real Apps-tab "Install from folder" button is **remotely feature-gated** (statsig/growthbook) and doesn't render for our account; `@voiceos/integration-sdk` from the docs isn't on npm. Identified no-UI route: quit VoiceOS, add an entry (`{manifest, dirPath, ownerUserId, enabled, installedAt}`) to `installedIntegrations` in `~/Library/Application Support/VoiceOS/config.json`, relaunch; fallback is repointing a Studio-created install. Meanwhile voice-only control (R12) already works via the ambient-transcript grammar.
- **TTS audibility:** MediBot speaks from a MacBook; the mic→speaker rig is for the room. Test routing MB1 audio out to the speaker at Phase 2; fallback = hold mic to laptop.
- **Camera stability:** no tripod — prop the Samsung + webcam rig and mark positions with tape before rehearsal.
- **Venue wifi:** Convex + Live API + Realtime all need network. Test on venue wifi at Phase 0; fallback = iPhone hotspot (test that too).
- **Single-provider concentration:** everything now rides one paid Gemini key. Mitigations: the `llm()` wrapper (flip agents to another provider by env flag), macOS `say` for callout TTS, and D1 must confirm **two concurrent Live sessions** (ears + eyes) run stably for 5 min on this key — check this at 1:00, not at rehearsal.
