# MediBot Eyes demo runbook

## Hardware map

- **MB3:** Chrome watcher at `/`; allow webcam, microphone, and audio.
- **Samsung:** landscape, brightness 100%, auto-lock off, `/monitor` full-screen.
- Put the Samsung 30–45 cm from the MB3 webcam. Fill at least half the camera frame with the monitor and avoid glare.
- Keep MB3 output audible but away from its microphone. Test venue Wi-Fi and an iPhone-hotspot backup.

## Preflight

1. Confirm the repo is on `p1-eyes` and `git status` is clean.
2. Confirm `.env` contains a rotated Gemini key and the real Convex deployment URL. `CONVEX_MOCK` must be `false`.
3. Start with `npm run dev`; open `/monitor` on the Samsung and `/` on MB3.
4. Open the watcher first, select **Start Eyes** once, then do not touch the keyboard during the demo.
5. The header must show **LIVE**, and the session line must say `Convex connected` without a mock warning.

## D1 — five-minute Live soak

- Leave webcam and mic running for five minutes.
- Speak normal room conversation without “MediBot”: no audio may play.
- Say “MediBot, status check”: one short audio response may play.
- Fail if the browser exposes a long-lived API key in its source, network URL, or bundle.

## D2 / R10 / R11

- At a monitor transition, start a stopwatch. A changed `vital` row must appear in Convex in under five seconds.
- Confirm repeated reads of the same tuple do not create additional rows.
- Seed `patientState` with a known last-epinephrine timestamp.
- Say: **“MediBot, when was the last epi?”** Audio must begin within 2.5 seconds and match Convex. If the value is absent, MediBot must say it is unavailable.

## D3 — simulated monitor

- Verify the Samsung cycles baseline → observe → alert every 15 seconds.
- All four numbers must be legible in the MB3 camera preview.
- Use `/monitor?seed=1` only if a different starting beat is needed; keep the seed fixed for both rehearsals.

## D4 — fallback

- Select **Force fallback** or block the Live connection.
- The header must show **FALLBACK**.
- Wait for a monitor change; a vital event must still arrive through the three-second frame poll.
- Retry Live before the scripted run. Live and fallback must never run simultaneously.

## 60-second script

| Time | Beat | Eyes responsibility |
| --- | --- | --- |
| 0–15s | Patient: “My chest hurts. I take warfarin.” | Maintain silent ambient watch; Lane A/B populate the chart. |
| 15–25s | Presenter gestures at the camera rig. | Latest HR/SpO₂/BP is already in Convex from monitor vision. |
| 25–35s | Medic: “Giving aspirin.” | Stay silent; Lane B safety flag and Lane A TTS own the alert. |
| 35–45s | Medic: “MediBot, when was the last epi?” | Call `query_patient_state`; answer once, briefly, from Convex. |
| 45–60s | Reveal hospital screen and live SBAR. | Keep vitals flowing; no extra narration. |

## Recording and freeze

- Record the first full run by 4:30; verify the 60-second file plays with audible alerts.
- Complete two consecutive clean runs before 5:30.
- Mark Samsung and webcam positions with tape; leave charger cables connected.
- At freeze, run `npm test && npm run build`, then check out the shared `demo-freeze` tag on every demo machine after the team creates it.
