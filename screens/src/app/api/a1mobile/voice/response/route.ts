import { appendEvent } from "@/lib/server/convex"
import { verifyA1Signature } from "@/lib/server/a1mobile"

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyA1Signature(raw, request.headers.get("x-a1-signature"))) {
    return new Response("Invalid relay signature", { status: 401 })
  }
  const type = request.headers.get("content-type") ?? ""
  let transcript = ""
  if (type.includes("application/json")) {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    transcript = String(parsed.SpeechResult ?? parsed.transcript ?? "")
  } else {
    const parsed = new URLSearchParams(raw)
    transcript = parsed.get("SpeechResult") ?? parsed.get("transcript") ?? ""
  }
  await appendEvent({
    ts: Date.now(),
    type: "sbar_update",
    source: "agent",
    role: "medic",
    payload: { kind: "hospital_coordination", stage: "hospital_response", transcript },
    conf: transcript ? 0.85 : 0,
    refs: [],
  })
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you. Your receiving response has been recorded for the medic.</Say><Hangup/></Response>',
    { status: 200, headers: { "content-type": "application/xml; charset=utf-8" } },
  )
}
