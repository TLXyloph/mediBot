import { appendEvent } from "@/lib/server/convex"
import { interpretHospitalSpeech, verifyA1Signature } from "@/lib/server/a1mobile"

export const maxDuration = 30

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
  const result = await interpretHospitalSpeech(transcript)
  await appendEvent({
    ts: Date.now(),
    type: "sbar_update",
    source: "agent",
    role: "medic",
    payload: {
      kind: "hospital_coordination",
      stage: "hospital_response",
      transcript,
      available: result.available,
      offloadMinutes: result.offloadMinutes,
      capabilities: result.capabilities,
      reason: result.reason,
      interpretationSource: result.source,
    },
    conf: result.confidence,
    refs: [],
  })
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${result.available === true ? "Thank you. Your availability has been recorded for the medic." : result.available === false ? "Thank you. Your capacity response has been recorded for the medic." : "Thank you. Your response has been recorded for the medic."}</Say><Hangup/></Response>`,
    { status: 200, headers: { "content-type": "application/xml; charset=utf-8" } },
  )
}
