# MedCrew + a1mobile

Hospital receiving coordination for the MedCrew hackathon demo. The service takes a verified patient snapshot, asks Gemini for the receiving requirements, uses an a1mobile provider to contact receiving centers, writes every stage to the Convex append-only event log, ranks eligible hospitals, and streams the confirmed SBAR before arrival.

The default configuration is a complete mock demo. It never dials a real phone number.

## Run the demo

```bash
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:4320`, select **Start coordination**, wait for the three hospital replies, then select **Confirm destination**.

The fixed scenario produces:

| Hospital | Travel | Accept | Offload | Cardiac | Total |
|---|---:|---|---:|---|---:|
| UCSF | 12 min | Yes | 18 min | Yes | **30 min** |
| SF General | 8 min | Yes | 52 min | Yes | 60 min |
| St. Mary's | 6 min | No | — | Yes | ineligible |

The ranker uses `travel minutes + offload minutes`; acceptance and all required capabilities are hard gates. The medic or dispatcher must confirm the recommendation.

## Pipeline

1. Read the patient snapshot, patient state, and live SBAR.
2. Gemini returns acuity, required receiving capabilities, reasons, and a compact clinical summary.
3. The a1mobile provider starts one outbound call per receiving center.
4. Hospital-side agents can query `POST /api/hospitals/:hospitalId/availability` as a tool.
5. Responses enter through the provider result or signed webhook.
6. Every stage is appended to Convex as a contract-compatible `sbar_update` event with `payload.kind = "hospital_coordination"`.
7. Eligible hospitals are ranked and the recommended destination is exposed to VoiceOS/UI.
8. `POST /api/cases/:caseId/confirm` records the human decision and sends the current SBAR to the selected hospital.

## HTTP surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Provider, Gemini, and Convex mode |
| `POST` | `/api/cases` | Start coordination; empty body runs the demo |
| `GET` | `/api/cases/:caseId` | Current case and ranking |
| `GET` | `/api/cases/:caseId/stream` | Server-sent case updates |
| `POST` | `/api/cases/:caseId/confirm` | Human destination confirmation |
| `POST` | `/api/a1mobile/webhook` | Signed real-provider result callback |
| `POST` | `/api/hospitals/:hospitalId/availability` | Mock hospital-side a1mobile tool |

## Connect the real a1mobile API

a1mobile's public site documents AI calling and messaging, but no public developer endpoint schema was available during implementation. Provider-specific assumptions are isolated in [`src/providers/rest.ts`](src/providers/rest.ts). When the sponsor supplies the official contract:

1. Compare its call, message, webhook, and signing fields with that one adapter.
2. Adjust only `RestA1MobileProvider` if field names differ.
3. Configure:

```dotenv
A1MOBILE_PROVIDER=rest
A1MOBILE_API_BASE_URL=https://api.example.a1mobile.com
A1MOBILE_API_KEY=...
A1MOBILE_AGENT_ID=...
A1MOBILE_WEBHOOK_SECRET=...
A1MOBILE_ALLOWED_NUMBERS=+14155550100,+14155550101,+14155550102
A1MOBILE_ALLOW_REAL_CALLS=true
PUBLIC_BASE_URL=https://your-public-callback.example
```

The REST provider will not construct unless all credentials, a webhook secret, explicit real-call approval, and at least one allowlisted number are present. A number not on the allowlist is rejected before any network request.

The adapter currently sends this bridge contract:

```json
{
  "agentId": "agent-id",
  "toNumber": "+14155550100",
  "prompt": "EMS receiving request",
  "initialGreeting": "EMS receiving request",
  "webhookUrl": "https://public.example/api/a1mobile/webhook",
  "metadata": { "caseId": "...", "hospitalId": "ucsf" }
}
```

Webhooks use `x-a1mobile-signature: sha256=<hex>` over the raw JSON body. Structured results are preferred:

```json
{
  "data": {
    "callId": "call_123",
    "metadata": { "caseId": "...", "hospitalId": "ucsf" },
    "structuredData": {
      "accepted": true,
      "offloadMinutes": 18,
      "capabilities": ["general", "cardiac"]
    },
    "transcript": "Yes, we can accept. Offload is 18 minutes."
  }
}
```

The parser also recognizes common field aliases and can extract acceptance and offload minutes from a transcript. Replace that normalization with the official event schema once received.

## Convex and Gemini

Set `CONVEX_MOCK=false` and configure the three string function names in `.env`. The service never imports generated Convex types, so it remains isolated from the brain lane.

Set `GEMINI_MOCK=false` and provide `GEMINI_API_KEY` to enable structured receiving-requirement extraction. Keys stay server-side and `.env` is ignored by git.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

This is a hackathon coordination prototype, not a 911 system or clinical decision-maker. Do not connect real hospitals or transmit protected health information without the required authorization, agreements, security review, and operational approval.
