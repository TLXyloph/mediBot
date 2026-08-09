# brain/ — Lane B (Convex event spine + agents)

Everything couples through the append-only `events` table. ePCR, SBAR, patient
state, and both dashboards are derived views over it. Nobody mutates or deletes
events; corrections are new `correction` events referencing the original via `refs`.

## Run it (Phase 0)

```bash
cd brain
npm install
npx convex dev          # interactive: logs in, creates deployment, writes .env.local, codegens
npx convex run seed:demo # optional: insert scripted demo beats
```

Share the `CONVEX_URL` from `brain/.env.local` with `screens/` and `eyes/` — that's the
deployment they connect to. Agent secrets are Convex env vars, not local `.env`:

```bash
npx convex env set LLM_PROVIDER gemini
npx convex env set GEMINI_API_KEY <paid-key>
npx convex env set GEMINI_MODEL  gemini-2.5-flash
```

## Function-name contract (for `anyApi` callers in screens/ and eyes/)

Other lanes call by string name (no shared generated types). These names + arg
shapes are the frozen contract — don't rename without telling C and D.

| Call | Kind | Args | Returns |
|---|---|---|---|
| `events.append` | mutation | `{ type, source, role?, payload, conf?, refs?, ts? }` | event id |
| `events.timeline` | query | `{ since?, limit? }` | events asc by `ts` |
| `epcr.epcr` | query | `{}` | `{ symptoms, medications, interventions, flags, corrections, vitals }`, each field carries provenance |
| `patientState.patientState` | query | `{}` | `{ medications, allergies, lastEpi, protocolPosition }` |
| `sbar.sbar` | query | `{}` | latest SBAR card (`_derived: true` until the SBAR agent runs) |

`type` ∈ utterance · vital · intervention · medication · symptom · correction · flag · protocol_state · timer · sbar_update
`source` ∈ voice · vision · agent · system
`role` ∈ medic · patient · partner · bystander

Example consumer:

```ts
import { anyApi } from "convex/server";
const timeline = useQuery(anyApi.events.timeline, {});
await convex.mutation(anyApi.events.append, {
  type: "utterance", source: "voice", role: "patient",
  payload: { text: "chest hurts... I take warfarin" },
});
```

## Reactive-agent trigger (the piece the plan didn't name)

`events.append` schedules follow-up agents via `ctx.scheduler.runAfter`. Today an
`utterance` schedules `scribe.run` (B2). Agents write via the internal
`events.appendInternal` so they never re-trigger themselves, and mark the source
event `processed` for idempotency. B3/B4/B5 hang off the same pattern.

## Status

- [x] B1 — schema, `append`, `timeline`, derived `epcr`/`patientState`/`sbar`
- [x] scribe trigger wired (scheduler → internalAction → internal append + processed marker)
- [ ] B2 — scribe extraction goes live once `GEMINI_API_KEY` is set (no-ops safely until then)
- [ ] B3 — safety agent · B4 — protocol timers · B5 — gap + SBAR agents
