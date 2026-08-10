import { ConvexHttpClient } from "convex/browser"
import { anyApi } from "convex/server"
import { answerFromPatientState, type PatientStateSummary } from "@/lib/clinical"
import type { ConvexEvent } from "@/types/events"

export const dynamic = "force-dynamic"

// Public twin of voice/'s local command server, so the VoiceOS integration
// works on ANY Mac (judges included): tool call → this route → the same
// append-only record. For questions it returns the spoken answer text —
// the caller's VoiceOS agent voices it (no eyes session needed).

const KINDS = new Set(["correction", "mark", "question"])

export async function POST(request: Request) {
  const url = process.env.CONVEX_URL?.trim() || process.env.NEXT_PUBLIC_CONVEX_URL?.trim()
  if (!url) return Response.json({ ok: false, error: "Convex is not configured" }, { status: 503 })

  let text = ""
  let kind: string | undefined
  try {
    const body = (await request.json()) as { text?: unknown; kind?: unknown }
    text = typeof body.text === "string" ? body.text : ""
    kind = typeof body.kind === "string" ? body.kind : undefined
  } catch {
    return Response.json({ ok: false, error: "body must be JSON" }, { status: 400 })
  }
  text = text.trim().slice(0, 2000)
  if (!text) return Response.json({ ok: false, error: "missing text" }, { status: 400 })
  if (kind !== undefined && !KINDS.has(kind)) {
    return Response.json({ ok: false, error: "kind must be correction|mark|question" }, { status: 400 })
  }

  const client = new ConvexHttpClient(url)
  const base = { ts: Date.now(), source: "voice" as const, conf: 1, refs: [] as string[] }

  if (kind === "correction") {
    await client.mutation(anyApi.events.append, {
      ...base, type: "correction", role: "medic", payload: { text, raw: text },
    })
    return Response.json({ ok: true, say: `Correction logged: ${text}.` })
  }
  if (kind === "mark") {
    await client.mutation(anyApi.events.append, {
      ...base, type: "intervention", role: "medic", payload: { text, mark: true, raw: text },
    })
    return Response.json({ ok: true, say: `Marked: ${text}.` })
  }
  if (kind === "question") {
    // payload.question = the scribe-skip tag (questions never create chart data)
    await client.mutation(anyApi.events.append, {
      ...base, type: "utterance", role: "medic", payload: { text, question: text },
    })
    const [events, patient] = await Promise.all([
      client.query(anyApi.events.timeline, { limit: 250 }) as Promise<ConvexEvent[]>,
      client.query(anyApi.patientState.patientState, {}) as Promise<PatientStateSummary>,
    ])
    return Response.json({ ok: true, say: answerFromPatientState(text, patient, events ?? []) })
  }

  await client.mutation(anyApi.events.append, { ...base, type: "utterance", payload: { text } })
  return Response.json({ ok: true, say: "Added to the record." })
}
