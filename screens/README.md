# MedCrew screens

Responsive field UI, verified ePCR, receiving-hospital view, monitor simulator, and A1mobile hospital coordination in one Next.js app.

## Routes

- `/` — responsive ambient monitor vision and wake-word patient Q&A
- `/medic` — reactive Convex ePCR, completeness, provenance, and append-only timeline
- `/hospital` — reactive SBAR, vitals trend, interventions, and safety flags
- `/coordinate` — receiving requirements, A1mobile calls, hospital ranking, medic confirmation, and live handoff
- `/monitor` — full-screen monitor scenario that changes every 15 seconds

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Keep `GEMINI_API_KEY` and `A1MOBILE_TEAM_KEY` server-only. `NEXT_PUBLIC_CONVEX_URL` is the only browser-exposed deployment value. Real A1mobile calls require all of the following:

1. `A1MOBILE_ALLOW_REAL_CALLS=true`
2. OTP-verified destination numbers in `A1MOBILE_ALLOWED_NUMBERS`
3. the corresponding hospital phone environment variable

Without those explicit settings, `/coordinate` remains fully interactive using the documented mock hospital states and never places a call.

## Verification

```bash
npm test -- --runInBand
npm run lint
npx tsc --noEmit
npm run build
```
