import "server-only"

import { appendEvent, timeline } from "@/lib/server/convex"
import { latestVitals } from "@/lib/clinical"

export interface VisionReading {
  hrBpm: number
  spo2Pct: number
  systolicMmHg: number
  diastolicMmHg: number
  confidence: number
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/

function bounded(value: unknown, minimum: number, maximum: number, label: string): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} is outside the monitor range`)
  }
  return Math.round(number)
}

export function validateReading(value: unknown): VisionReading {
  if (!value || typeof value !== "object") throw new Error("Gemini returned no monitor reading")
  const reading = value as Record<string, unknown>
  const result = {
    hrBpm: bounded(reading.hrBpm, 20, 250, "Heart rate"),
    spo2Pct: bounded(reading.spo2Pct, 50, 100, "SpO2"),
    systolicMmHg: bounded(reading.systolicMmHg, 40, 260, "Systolic pressure"),
    diastolicMmHg: bounded(reading.diastolicMmHg, 20, 180, "Diastolic pressure"),
    confidence: Math.max(0, Math.min(1, Number(reading.confidence ?? 0.8))),
  }
  if (result.systolicMmHg <= result.diastolicMmHg) throw new Error("Blood pressure is not valid")
  return result
}

export async function analyzeMonitor(image: string): Promise<{ reading: VisionReading | null; duplicate: boolean }> {
  const match = DATA_URL.exec(image)
  if (!match?.[1] || !match[2] || match[2].length > 2_800_000) throw new Error("Invalid or oversized monitor frame")
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("Gemini vision is not configured")
  const model = process.env.GEMINI_VISION_MODEL ?? "gemini-3.1-flash-lite-preview"
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: match[1], data: match[2] } },
              {
                text: "Read this patient monitor. Return detected false unless HR, SpO2, systolic BP, and diastolic BP are all clearly visible. Never infer obscured digits.",
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              detected: { type: "BOOLEAN" },
              hrBpm: { type: "INTEGER" },
              spo2Pct: { type: "INTEGER" },
              systolicMmHg: { type: "INTEGER" },
              diastolicMmHg: { type: "INTEGER" },
              confidence: { type: "NUMBER" },
            },
            required: ["detected", "confidence"],
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    },
  )
  if (!response.ok) throw new Error(`Gemini vision request failed (${response.status})`)
  const json = (await response.json()) as Record<string, unknown>
  const candidates = json.candidates as Array<Record<string, unknown>> | undefined
  const content = candidates?.[0]?.content as Record<string, unknown> | undefined
  const parts = content?.parts as Array<Record<string, unknown>> | undefined
  const text = parts?.find((part) => typeof part.text === "string")?.text
  const parsed = JSON.parse(typeof text === "string" ? text : "{}") as Record<string, unknown>
  if (parsed.detected !== true) return { reading: null, duplicate: false }
  const reading = validateReading(parsed)
  const previous = latestVitals(await timeline(40))
  const duplicate =
    previous.ts > 0 &&
    previous.hrBpm === reading.hrBpm &&
    previous.spo2Pct === reading.spo2Pct &&
    previous.systolicMmHg === reading.systolicMmHg &&
    previous.diastolicMmHg === reading.diastolicMmHg
  if (duplicate) return { reading, duplicate: true }
  const ts = Date.now()
  const values: Array<[string, number]> = [
    ["hr", reading.hrBpm],
    ["spo2", reading.spo2Pct],
    ["sbp", reading.systolicMmHg],
    ["dbp", reading.diastolicMmHg],
  ]
  for (const [name, value] of values) {
    await appendEvent({
      ts,
      type: "vital",
      source: "vision",
      role: "medic",
      payload: { name, value },
      conf: reading.confidence,
      refs: [],
    })
  }
  return { reading, duplicate: false }
}
