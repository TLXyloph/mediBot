# brain/ — Lane B (Convex event spine + agents)

Everything couples through the append-only `events` table. ePCR, SBAR, patient
state, and both dashboards are derived views over it. Nobody mutates or deletes
events; corrections are new `correction` events referencing the original via `refs`.

## Connection details (LIVE — share these with screens/ and eyes/)

The deployment is **public-function** access: clients connect with just the URL,
no token. These values are safe to commit; they are **not** secrets.

| Key | Value |
|---|---|
| Convex URL (client → this is what `screens/` + `eyes/` use) | `https://amicable-panther-654.convex.cloud` |
| HTTP Actions / site URL | `https://amicable-panther-654.convex.site` |
| Deployment | `dev:amicable-panther-654` |
| Team / Project | `shubham-shinde` / `hack-with-voiceos` |
| Dashboard | https://dashboard.convex.dev/d/amicable-panther-654 |

Client setup in another lane:

```bash
# screens/ and eyes/ each put this in their own .env (NOT committed):
echo 'VITE_CONVEX_URL=https://amicable-panther-654.convex.cloud' >> .env.local
```
```ts
import { ConvexReactClient } from "convex/react";
const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
```

### Secrets (NEVER commit these — set as Convex env vars only)

Agent code reads these from `process.env` inside Convex actions, so they live on
the deployment, not in any file. Values are **not** stored in this repo:

```bash
npx convex env set LLM_PROVIDER gemini
npx convex env set GEMINI_API_KEY <paid-gemini-key>   # the actual key — keep it out of git/screen-share
npx convex env set GEMINI_MODEL  gemini-2.5-flash
# insurance flip to OpenAI is config, not code:
# npx convex env set LLM_PROVIDER openai && npx convex env set OPENAI_API_KEY <key>
```

`npx convex env list` shows what's set (names only). `brain/.env.local` (deployment
config, gitignored) is written by `npx convex dev` — don't commit it.

## Schema (`events` table — the whole contract)

```ts
events: {
  ts:        number,                      // epoch ms; defaults to now on append
  type:      "utterance" | "vital" | "intervention" | "medication" | "symptom"
           | "correction" | "flag" | "protocol_state" | "timer" | "sbar_update",
  source:    "voice" | "vision" | "agent" | "system",
  role?:     "medic" | "patient" | "partner" | "bystander",
  payload:   any,                         // shape depends on type (see below)
  conf?:     number,                      // 0..1 model confidence
  refs?:     string[],                    // event ids this one references (corrections, provenance)
  processed?: boolean,                    // agent idempotency marker; not part of the public contract
}
// indexes: by_ts [ts]  ·  by_type [type]
```

Common `payload` shapes: `medication {name}` · `symptom {text, allergy?}` ·
`vital {name, value}` · `intervention {name}` · `flag {reason, ...}` ·
`protocol_state {name}` · `sbar_update {situation, background, assessment, recommendation}`.

Append-only. Nobody mutates or deletes; a `correction` event carries the new value
and points at the original via `refs`.

## Run it (Phase 0)

```bash
cd brain
npm install
npx convex dev          # interactive: logs in, creates deployment, writes .env.local, codegens
npx convex run seed:demo # optional: insert scripted demo beats
```

Connection URL + agent secrets are documented in **Connection details** above.

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
- [x] **B2 — scribe extraction LIVE & verified**: scripted line → `symptom`+`medication`, `role: patient`, in 2.65s (R2 ✅ / R3 ✅). Gemini via `@google/genai` SDK (`scribe.ts` is `"use node"`), model `gemini-flash-lite-latest` (~0.6s), **structured output (`responseSchema`)** so extraction can't be lost to malformed JSON. NB: the raw `:generateContent` REST endpoint was retired on this account — the SDK is the working path.
- [x] **B3 — safety agent** (`safety.ts`): deterministic drug-conflict rules (anticoagulant↔antiplatelet/NSAID + allergy match), dedupe. R4 ✅ — end-to-end utterance→scribe→flag in 2.82s.
- [x] **B4 — protocol timers** (`protocol.ts`): `start` + scheduler-driven `rhythmCheck`/`epi`, `DEMO_CLOCK` scaling, runaway cap. R6 ✅ — rhythm at 30.01s with `DEMO_CLOCK=4`.
- [x] **B5 — gap + SBAR agents** (`gap.ts`, `sbar.ts`): gap asks missing `age` with quiet-moment defer (R5 ✅, 4.5s); SBAR deterministically assembled, emitted only on change. `sbar` query populated.

Agent trigger routing is centralized in `events.ts` (`insertAndRoute`) using string function refs, so each agent lane plugs in without cross-file coupling.

**Deployment env vars in use:** `LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-flash-lite-latest`, `DEMO_CLOCK=4`.
