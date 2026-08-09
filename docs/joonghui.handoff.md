# Joonghui handoff — MedCrew product UI and hospital coordination

Owner: Joonghui (`joonghui0926`)  
App: `screens/`  
Production: <https://medcrew-nu.vercel.app>

This is the implementation handoff for the unified MedCrew web UI and its Gemini, Convex, and A1mobile coordination surfaces. It describes what the UI shows, which code owns each capability, and what must be configured before a real outbound call can happen. No credentials belong in this document.

## What the user sees

| Route | Purpose | Live data and actions |
|---|---|---|
| `/` | Ambient monitor vision and patient Q&A | Camera capture, Gemini monitor reading, Convex vital writes, browser voice question flow |
| `/medic` | Medic ePCR | Reactive patient record, completeness, provenance, correction history, timeline |
| `/coordinate` | A1mobile hospital coordination | End-to-end pipeline, call readiness, hospital-agent activity, acceptance/offload results, ranking, medic confirmation |
| `/monitor` | Bedside monitor simulator | Full-screen HR, SpO₂, and BP scenario cycling every 15 seconds |
| `/hospital` | Receiving view | Live SBAR, vitals trend, interventions, alerts, pre-arrival handoff |

The shared navigation and identity live in `screens/src/components/MedCrewHeader.tsx`. The route-specific UI lives in `screens/src/app/<route>/page.tsx` with colocated CSS modules.

## Visible care pipeline

`/coordinate` intentionally exposes the complete operating loop instead of showing only the final recommendation:

1. **Voice + monitor** — patient/medic voice and bedside monitor evidence are captured.
2. **Gemini understands** — vision and speech evidence become structured clinical observations.
3. **Convex verifies** — append-only events produce the current patient state and SBAR.
4. **A1mobile calls** — the coordinator prepares one contact per receiving hospital.
5. **Hospitals respond** — acceptance, capability, capacity, and offload ETA are returned.
6. **Destination ranked** — required capability is a hard gate; eligible hospitals are ranked by travel + offload time.
7. **Live handoff** — the medic confirms the destination, then the verified SBAR continues to the receiving view.

Each stage displays `waiting`, `active`, `complete`, or `attention` state from the page's actual query/action state. A separate dark **A1mobile call activity** panel shows the exact question, each hospital target, current contact state, response summary, and the live-call safety checks.

Primary implementation files:

- `screens/src/app/coordinate/page.tsx` — pipeline state, 15-second A1 status checks, call activity, result selection, confirmation
- `screens/src/app/coordinate/coordinate.module.css` — responsive pipeline and call-activity presentation
- `screens/src/lib/server/a1mobile.ts` — number status, allowlist enforcement, outbound calls, SBAR handoff, signature verification
- `screens/src/app/api/a1mobile/status/route.ts` — browser-safe readiness status (never returns credentials)
- `screens/src/app/api/a1mobile/coordinate/route.ts` — starts hospital coordination
- `screens/src/app/api/a1mobile/voice/route.ts` — signed A1 relay entry and TeXML prompt
- `screens/src/app/api/a1mobile/voice/response/route.ts` — records returned speech transcript in Convex
- `screens/src/app/api/a1mobile/confirm/route.ts` — human destination confirmation and handoff

## A1mobile state at handoff

The claimed MedCrew number was checked through `GET /numbers/me` and pointed to:

`https://medcrew-nu.vercel.app/api/a1mobile/voice`

The number now reports `webhook` mode. This proves the provider can invoke our TeXML route when an outbound call is answered. It does **not** yet mean arbitrary calls can be made.

The UI rechecks the following conditions every 15 seconds:

- `Webhook connected` — A1mobile reports webhook mode.
- `n/3 verified + allowlisted targets` — a configured hospital number appears in A1mobile's OTP verification list and in the server allowlist.
- `Outbound enabled` — the explicit real-call flag is on and at least one callable target exists.

At this handoff, webhook wiring is connected but A1mobile's read-only verification list returns zero numbers. Outbound calling is therefore safety-locked, and the real-call flag also remains off. Demo hospital agents remain fully interactive and no external number is dialed.

### Enabling an authorized live target

Use only a consenting phone number that can receive the OTP. Never use a real emergency department number for a hackathon test without explicit authorization.

1. Request and confirm OTP verification through the A1mobile API.
2. Set the verified number as one of `A1MOBILE_UCSF_PHONE`, `A1MOBILE_SF_GENERAL_PHONE`, or `A1MOBILE_ST_MARYS_PHONE`.
3. Add the same exact E.164 number to `A1MOBILE_ALLOWED_NUMBERS`.
4. Set `A1MOBILE_ALLOW_REAL_CALLS=true` only in the server/Vercel environment.
5. Redeploy and wait up to 15 seconds. `/coordinate` must show `Webhook connected`, at least `1/3 verified + allowlisted targets`, and `Outbound enabled` before the Call action can place a live call.
6. Run one consented test. A1mobile calls the target, invokes `/api/a1mobile/voice` on answer, speaks the receiving question, gathers speech, and posts the transcript to `/api/a1mobile/voice/response`.

Required server-only variables:

```dotenv
A1MOBILE_API_BASE_URL=
A1MOBILE_TEAM_KEY=
A1MOBILE_PHONE_NUMBER=
A1MOBILE_ALLOW_REAL_CALLS=false
A1MOBILE_ALLOWED_NUMBERS=
A1MOBILE_UCSF_PHONE=
A1MOBILE_SF_GENERAL_PHONE=
A1MOBILE_ST_MARYS_PHONE=
```

Never prefix these variables with `NEXT_PUBLIC_`. The team key, SIP password, Gemini key, and target phone list must never enter client bundles, screenshots, commits, or issue text.

## Gemini and Convex wiring

`screens/` uses server-side Gemini frame analysis for the integrated vision UI. The dedicated `eyes/` package retains the Gemini Live implementation and 3-second fallback design. Do not claim that the browser page is in a Live session unless its visible status confirms it.

Convex is the source of truth. UI routes read `events:timeline` reactively and derive ePCR, vitals, SBAR, and coordination state. Server writes are append-only. Corrections and hospital stages append new events; they do not mutate history.

Relevant variables:

```dotenv
NEXT_PUBLIC_CONVEX_URL=
CONVEX_URL=
CONVEX_APPEND_FUNCTION=events:append
CONVEX_PATIENT_STATE_FUNCTION=patientState:patientState
CONVEX_SBAR_FUNCTION=sbar:sbar
GEMINI_API_KEY=
GEMINI_VISION_MODEL=
```

## UI system

- Single flat warm-beige background; no gradients.
- Fluorescent orange is the action/status accent, with green only for verified success.
- Large Google/Gemini-like type scale and compact line height.
- Lucide icons only; icons accompany text and never replace critical labels.
- Avoid wrapping every item in a card. Structure comes from spacing, type, and one purposeful dark operational surface.
- Desktop and mobile use the same components. Wide rails become horizontal scroll regions; action rows stack on narrow screens.
- Logo asset: `screens/public/medcrew-logo.png` (transparent background).

Shared color and type tokens are in `screens/src/app/globals.css`. Clinical shared layout styles are in `screens/src/app/clinical.module.css`.

## Local run and verification

```bash
cd screens
npm install
npm run dev
```

Before shipping:

```bash
npm test -- --runInBand
npm run lint
npx tsc --noEmit
npm run build
```

Manual checks:

- `/coordinate` shows all seven pipeline stages without horizontal page overflow.
- Pressing **Call receiving hospitals** visibly moves A1mobile and hospital stages through processing to results.
- Call activity shows all three targets, the spoken question, acceptance/capacity, and offload ETA.
- In demo mode, the UI says no external number was dialed.
- Destination confirmation updates the handoff stage and appends the confirmation to Convex.
- Mobile layout keeps text legible and does not hide the pipeline.
- Browser console has no errors.

## Known limits

- Hospital acceptance/offload values are deterministic scenario state until a verified live target returns speech through the webhook.
- The live voice response route records the transcript; richer transcript-to-structured-response parsing and per-hospital call correlation should be the next backend hardening task.
- This is a hackathon prototype, not a clinical dispatch system. Do not send PHI or contact real hospitals without authorization, consent, security review, and operating agreements.

## Teammate continuation checklist

- Pull `main`, copy `screens/.env.example` to `.env.local`, and provide secrets only through local/Vercel environment settings.
- Preserve the append-only Convex contract and the explicit medic-confirmation step.
- Preserve demo/live labeling. Never make a mock response look like a completed real phone call.
- If the A1 number stops reporting webhook mode, repoint it to the production `/api/a1mobile/voice` endpoint and confirm `/api/a1mobile/status` again.
- Keep changes within `screens/` unless a coordinated cross-lane change is agreed.
