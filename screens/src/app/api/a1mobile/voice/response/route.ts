import { appendEvent } from "@/lib/server/convex"
import { interpretHospitalSpeech, verifyA1Signature } from "@/lib/server/a1mobile"

export const maxDuration = 30

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function followUpTexml(actionUrl: string, question: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${xmlEscape(actionUrl)}" method="POST" speechTimeout="auto" timeout="12"><Say>${xmlEscape(question)}</Say></Gather><Say>No additional response was received. MedCrew will follow up.</Say></Response>`
}

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
  const url = new URL(request.url)
  const priorAvailable = url.searchParams.get("available")
  const available = result.available ?? (priorAvailable === "true" ? true : priorAvailable === "false" ? false : null)
  const needsAvailability = available === null
  const needsOffload = available === true && result.offloadMinutes === null
  const needsFollowUp = needsAvailability || needsOffload
  const followUpQuestion = needsAvailability
    ? "To confirm, are you available to receive this patient? Please answer yes or no."
    : result.followUpQuestion ?? "What is your estimated offload time in minutes?"
  await appendEvent({
    ts: Date.now(),
    type: "sbar_update",
    source: "agent",
    role: "medic",
    payload: {
      kind: "hospital_coordination",
      stage: needsFollowUp ? "hospital_response_turn" : "hospital_response",
      transcript,
      available,
      offloadMinutes: result.offloadMinutes,
      capabilities: result.capabilities,
      reason: result.reason,
      interpretationSource: result.source,
    },
    conf: result.confidence,
    refs: [],
  })
  if (needsFollowUp) {
    if (available !== null) url.searchParams.set("available", String(available))
    return new Response(followUpTexml(url.toString(), followUpQuestion), {
      status: 200,
      headers: { "content-type": "application/xml; charset=utf-8" },
    })
  }
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${available === true ? "Thank you. Your availability and offload estimate have been recorded for the medic." : "Thank you. Your capacity response has been recorded for the medic."}</Say><Hangup/></Response>`,
    { status: 200, headers: { "content-type": "application/xml; charset=utf-8" } },
  )
}
