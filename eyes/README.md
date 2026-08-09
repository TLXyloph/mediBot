# MediBot Eyes — Lane D

Gemini Live watcher, simulated patient monitor, and demo kit for the VoiceOS hackathon. This package is intentionally self-contained under `eyes/`; it does not import generated Convex types or files from another lane.

## Run

```bash
cd eyes
npm install
cp .env.example .env
npm run dev
```

Open:

- Watcher on MB3: `http://localhost:3000/`
- Simulated monitor on the Samsung: `http://<MB3-LAN-IP>:3000/monitor`
- Printable beat cards: `http://localhost:3000/beat-cards.html`

Use a freshly rotated AI Studio key in `eyes/.env`. Never use a `VITE_` prefix for the key; `VITE_` values are embedded in browser bundles.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | required | Server-only key used to mint Live ephemeral tokens and run fallback vision |
| `GEMINI_LIVE_MODEL` | `gemini-3.1-flash-live-preview` | Native-audio Live model |
| `GEMINI_VISION_MODEL` | `gemini-3.6-flash` | Structured 3-second fallback frame reader |
| `CONVEX_URL` | required for demo | Convex deployment URL |
| `CONVEX_APPEND_FUNCTION` | `events:append` | Append-only event mutation |
| `CONVEX_PATIENT_STATE_FUNCTION` | `events:patientState` | Patient-state query |
| `CONVEX_MOCK` | `false` | Explicit local-only mock; watcher shows a warning while active |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | LAN server binding for the Samsung |

## Event contract

`report_vitals` validates and appends:

```ts
{
  ts: number,
  type: "vital",
  source: "vision",
  role: "medic",
  payload: { hrBpm, spo2Pct, systolicMmHg, diastolicMmHg },
  conf: number,
  refs: []
}
```

Identical consecutive readings are suppressed. A new tuple is published immediately.

## Checks

```bash
npm test
npm run typecheck
npm run build
```

See [DEMO_RUNBOOK.md](./DEMO_RUNBOOK.md) for D1–D5 and R10/R11 acceptance checks.
