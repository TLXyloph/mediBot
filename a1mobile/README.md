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
| `POST` | `/voice` | Signed a1mobile voice relay; returns TeXML prompt/gather |
| `POST` | `/voice/response` | TeXML speech result → Convex response and reranking |
| `POST` | `/sms` | Signed inbound SMS relay → append-only event |

## Connect the hack a1mobile API

The exact hack API is implemented in [`src/providers/hack.ts`](src/providers/hack.ts). It authenticates every request with `X-Team-Key`, places calls with `POST /calls { "to": "+1..." }`, sends handoffs through `/sms`, and verifies relay header `X-A1-Signature = HMAC-SHA256(raw body, team key)`.

Store the team credentials only in the gitignored `.env`:

```dotenv
A1MOBILE_PROVIDER=hack
A1MOBILE_API_BASE_URL=https://hack.a1mobile.com/api
A1MOBILE_TEAM_KEY=team-...
A1MOBILE_PHONE_NUMBER=+1...
A1MOBILE_SIP_USERNAME=...
A1MOBILE_SIP_PASSWORD=...
A1MOBILE_VOICE_WEBHOOK_URL=https://your-public-callback.example/voice
A1MOBILE_SMS_WEBHOOK_URL=https://your-public-callback.example/sms
A1MOBILE_ALLOWED_NUMBERS=+14155550100,+14155550101,+14155550102
A1MOBILE_ALLOW_REAL_CALLS=true
A1MOBILE_AUTO_POINT=false
PUBLIC_BASE_URL=https://your-public-callback.example
```

Every destination must first pass a1mobile OTP verification. The provider also requires explicit real-call approval, a configured voice webhook, and a local allowlist. A number not on the allowlist is rejected before a network request.

### Number and webhook CLI

```bash
npm run a1:info
npm run a1 -- claim
npm run a1 -- point https://public.example/voice
npm run a1 -- unpoint
npm run a1 -- request-verify +1NUMBER
npm run a1 -- confirm-verify +1NUMBER 123456
npm run a1 -- sms-webhook https://public.example/sms
npm run a1 -- inbound-sms 0
```

`claim` is idempotent. A number starts in SIP mode and changes to webhook mode after `point`. `A1MOBILE_AUTO_POINT=true` can point on server startup, but is intentionally disabled by default.

### Voice flow

1. The coordinator stores the pending case for each verified hospital number.
2. `/calls` starts the outbound call.
3. a1mobile invokes the pointed `/voice` webhook when the hospital answers.
4. `/voice` returns TeXML containing the case-specific receiving prompt and a speech gather.
5. `/voice/response` converts the speech transcript into acceptance, offload ETA, and capability data, then records it in Convex and reranks the destination.
6. Confirmation sends the verified SBAR through `/sms` to the selected hospital.

The `/sms` relay also accepts signed inbound text events and appends them to the coordination event stream.

### MCP option

[`mcp.example.json`](mcp.example.json) contains the streamable HTTP MCP endpoint. Keep the trailing slash. The same team key is passed as `team_key` only from a trusted server-side agent; never put it in browser code or commit it.

The direct REST adapter is used for the deterministic demo pipeline. MCP remains available for VoiceOS or another server-side agent that wants to invoke `claim_number`, `number_info`, `point_number`, `place_call`, verification, SMS, or inbound-message tools itself.

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
