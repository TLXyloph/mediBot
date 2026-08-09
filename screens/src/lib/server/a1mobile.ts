import "server-only"

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"

import {
  rankHospitalResults,
  receivingRequirements,
  type Capability,
  type CoordinationPatient,
  type CoordinationResult,
  type HospitalResult,
} from "@/lib/coordination"
import { appendEvent, latestSbar, patientState } from "@/lib/server/convex"

interface HospitalConfig {
  id: string
  name: string
  phone?: string
  travelMinutes: number
  capabilities: Capability[]
  accepting: boolean
  offloadMinutes: number | null
  reason?: string
}

const hospitals: HospitalConfig[] = [
  {
    id: "ucsf",
    name: "UCSF",
    phone: process.env.A1MOBILE_UCSF_PHONE,
    travelMinutes: 12,
    capabilities: ["general", "cardiac", "stroke", "pediatric"],
    accepting: true,
    offloadMinutes: 18,
  },
  {
    id: "sf-general",
    name: "SF General",
    phone: process.env.A1MOBILE_SF_GENERAL_PHONE,
    travelMinutes: 8,
    capabilities: ["general", "cardiac", "stroke", "trauma"],
    accepting: true,
    offloadMinutes: 52,
  },
  {
    id: "st-marys",
    name: "St. Mary's",
    phone: process.env.A1MOBILE_ST_MARYS_PHONE,
    travelMinutes: 6,
    capabilities: ["general", "cardiac"],
    accepting: false,
    offloadMinutes: null,
    reason: "Capacity",
  },
]

function envTrue(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true"
}

function allowedNumbers(): Set<string> {
  return new Set(
    (process.env.A1MOBILE_ALLOWED_NUMBERS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

async function a1Request(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const teamKey = process.env.A1MOBILE_TEAM_KEY
  if (!teamKey) throw new Error("A1mobile is not configured")
  const response = await fetch(`${process.env.A1MOBILE_API_BASE_URL ?? "https://hack.a1mobile.com/api"}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-Team-Key": teamKey,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 160)
    throw new Error(`A1mobile request failed (${response.status}): ${detail}`)
  }
  if (response.status === 204) return {}
  return (await response.json()) as Record<string, unknown>
}

export async function a1Status(): Promise<{
  configured: boolean
  realCallsEnabled: boolean
  phoneNumber: string | null
  wiringMode: string | null
  webhookReady: boolean
  configuredTargetCount: number
  approvedTargetCount: number
  providerVerifiedTargetCount: number
  callableTargetCount: number
  outboundReady: boolean
  checkedAt: number
}> {
  const approved = allowedNumbers()
  const configuredTargets = hospitals.filter((hospital) => Boolean(hospital.phone))
  const approvedTargets = configuredTargets.filter((hospital) => hospital.phone && approved.has(hospital.phone))
  const base = {
    configuredTargetCount: configuredTargets.length,
    approvedTargetCount: approvedTargets.length,
    checkedAt: Date.now(),
  }
  if (!process.env.A1MOBILE_TEAM_KEY) {
    return {
      configured: false,
      realCallsEnabled: false,
      phoneNumber: null,
      wiringMode: null,
      webhookReady: false,
      providerVerifiedTargetCount: 0,
      callableTargetCount: 0,
      outboundReady: false,
      ...base,
    }
  }
  try {
    const info = await a1Request("/numbers/me")
    const verificationInfo = await a1Request("/verified-numbers").catch(() => ({ verified_numbers: [] }))
    const providerVerified = new Set(
      (Array.isArray(verificationInfo.verified_numbers) ? verificationInfo.verified_numbers : [])
        .map((value) => {
          if (typeof value === "string") return value
          if (value && typeof value === "object") {
            const record = value as Record<string, unknown>
            return String(record.phone ?? record.phone_number ?? record.number ?? "")
          }
          return ""
        })
        .filter(Boolean),
    )
    const providerVerifiedTargetCount = configuredTargets.filter(
      (hospital) => hospital.phone && providerVerified.has(hospital.phone),
    ).length
    const callableTargetCount = approvedTargets.filter(
      (hospital) => hospital.phone && providerVerified.has(hospital.phone),
    ).length
    const wiringMode = String(info.mode ?? info.wiring_mode ?? "") || null
    const webhookReady = wiringMode?.toLowerCase() === "webhook" || Boolean(info.webhook_url)
    const realCallsEnabled = envTrue("A1MOBILE_ALLOW_REAL_CALLS")
    return {
      configured: true,
      realCallsEnabled,
      phoneNumber: String(info.phone_number ?? process.env.A1MOBILE_PHONE_NUMBER ?? "") || null,
      wiringMode,
      webhookReady,
      providerVerifiedTargetCount,
      callableTargetCount,
      outboundReady: realCallsEnabled && webhookReady && callableTargetCount > 0,
      ...base,
    }
  } catch {
    const realCallsEnabled = envTrue("A1MOBILE_ALLOW_REAL_CALLS")
    return {
      configured: true,
      realCallsEnabled,
      phoneNumber: process.env.A1MOBILE_PHONE_NUMBER ?? null,
      wiringMode: null,
      webhookReady: false,
      providerVerifiedTargetCount: 0,
      callableTargetCount: 0,
      outboundReady: false,
      ...base,
    }
  }
}

function buildSbar(patient: CoordinationPatient, requirements: CoordinationResult["requirements"]): string {
  return [
    `Situation: ${patient.age}-year-old ${patient.sex ?? "patient"} with ${patient.chiefComplaint}.`,
    `Background: Medications ${patient.medications.join(", ") || "none known"}; allergies ${patient.allergies.join(", ") || "none known"}.`,
    `Assessment: HR ${patient.vitals.hrBpm}, SpO2 ${patient.vitals.spo2Pct}%, BP ${patient.vitals.systolicMmHg}/${patient.vitals.diastolicMmHg}.`,
    `Recommendation: ${requirements.capabilities.join(", ")} receiving capability required.`,
  ].join("\n")
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === "string") return item
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>
        return String(record.name ?? record.text ?? "")
      }
      return ""
    })
    .filter(Boolean)
}

export async function coordinateHospitals(patient: CoordinationPatient, origin: string): Promise<CoordinationResult> {
  const state = await patientState()
  const merged: CoordinationPatient = {
    ...patient,
    medications: [...new Set([...patient.medications, ...textList(state.medications)])],
    allergies: [...new Set([...patient.allergies, ...textList(state.allergies)])],
  }
  const requirements = receivingRequirements(merged)
  const generatedSbar = buildSbar(merged, requirements)
  const convexSbar = await latestSbar()
  const sbarParts = ["situation", "background", "assessment", "recommendation"]
    .map((key) => convexSbar[key])
    .filter((value): value is string => typeof value === "string" && Boolean(value))
  const sbar = sbarParts.length === 4 ? sbarParts.join("\n") : generatedSbar
  const caseId = randomUUID()
  const approved = allowedNumbers()
  const liveStatus = await a1Status()
  const canCall = liveStatus.outboundReady
  let pointed = false

  if (canCall) {
    const webhook = new URL("/api/a1mobile/voice", origin)
    const relayToken = a1RelayToken()
    if (relayToken) webhook.searchParams.set("relay", relayToken)
    await a1Request("/numbers/point", { webhook_url: webhook.toString() })
    pointed = true
  }

  const rawResults: Omit<HospitalResult, "score" | "eligible">[] = []
  for (const hospital of hospitals) {
    let callPlaced = false
    if (pointed && hospital.phone && approved.has(hospital.phone)) {
      await a1Request("/calls", { to: hospital.phone })
      callPlaced = true
    }
    rawResults.push({
      id: hospital.id,
      name: hospital.name,
      travelMinutes: hospital.travelMinutes,
      offloadMinutes: hospital.offloadMinutes,
      accepted: hospital.accepting,
      capabilities: hospital.capabilities,
      ...(hospital.reason ? { reason: hospital.reason } : {}),
      callPlaced,
    })
  }

  const ranked = rankHospitalResults(rawResults, requirements.capabilities)
  const result: CoordinationResult = {
    caseId,
    mode: rawResults.some((result) => result.callPlaced) ? "live" : "demo",
    requirements,
    sbar,
    hospitals: ranked,
    recommendedHospitalId: ranked.find((hospital) => hospital.eligible)?.id ?? null,
    createdAt: Date.now(),
  }
  await appendEvent({
    ts: result.createdAt,
    type: "sbar_update",
    source: "agent",
    role: "medic",
    payload: { kind: "hospital_coordination", stage: "destination_recommended", ...result },
    conf: 1,
    refs: [],
  })
  return result
}

export async function confirmDestination(
  result: CoordinationResult,
  hospitalId: string,
): Promise<{ confirmedHospitalId: string; handoffSent: boolean }> {
  const hospital = result.hospitals.find((candidate) => candidate.id === hospitalId)
  if (!hospital?.eligible) throw new Error("Select an eligible receiving hospital")
  const config = hospitals.find((candidate) => candidate.id === hospitalId)
  let handoffSent = false
  if (
    result.mode === "live" &&
    config?.phone &&
    allowedNumbers().has(config.phone) &&
    envTrue("A1MOBILE_ALLOW_REAL_CALLS")
  ) {
    await a1Request("/sms", { to: config.phone, body: `Destination confirmed. Live MedCrew handoff:\n\n${result.sbar}` })
    handoffSent = true
  }
  await appendEvent({
    ts: Date.now(),
    type: "sbar_update",
    source: "system",
    role: "medic",
    payload: {
      kind: "hospital_coordination",
      stage: "destination_confirmed",
      caseId: result.caseId,
      hospitalId,
      hospitalName: hospital.name,
      handoffSent,
    },
    conf: 1,
    refs: [],
  })
  return { confirmedHospitalId: hospitalId, handoffSent }
}

export function verifyA1Signature(rawBody: string, signature: string | null): boolean {
  const key = process.env.A1MOBILE_TEAM_KEY
  if (!key || !signature) return false
  const digest = createHmac("sha256", key).update(rawBody).digest()
  const expected = new Set([
    digest.toString("hex").toLowerCase(),
    digest.toString("base64"),
    digest.toString("base64url"),
  ])
  const supplied = signature
    .split(",")
    .flatMap((part) => {
      const trimmed = part.trim()
      const value = trimmed.includes("=") ? trimmed.slice(trimmed.indexOf("=") + 1).trim() : trimmed
      return [trimmed, value]
    })
    .filter(Boolean)
  return supplied.some((candidate) => {
    const normalized = /^[0-9a-f]+$/i.test(candidate) ? candidate.toLowerCase() : candidate
    return [...expected].some((expectedValue) => {
      if (expectedValue.length !== normalized.length) return false
      return timingSafeEqual(Buffer.from(expectedValue, "utf8"), Buffer.from(normalized, "utf8"))
    })
  })
}

export function a1RelayToken(): string | null {
  const key = process.env.A1MOBILE_TEAM_KEY
  if (!key) return null
  return createHmac("sha256", key).update("medcrew-a1-relay-v1").digest("base64url")
}

export function verifyA1RelayToken(provided: string | null): boolean {
  const expected = a1RelayToken()
  if (!expected || !provided || expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"))
}

export function voiceTexml(actionUrl: string): string {
  const escaped = actionUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${escaped}" method="POST" speechTimeout="auto" timeout="12"><Say>This is MedCrew EMS coordination. We have a high acuity patient requiring cardiac capable emergency care. Are you available to receive this patient? Please answer yes or no, and include your estimated offload time.</Say></Gather><Say>No response was received. MedCrew will follow up.</Say></Response>`
}

export interface HospitalSpeechResult {
  available: boolean | null
  offloadMinutes: number | null
  capabilities: string[]
  reason: string | null
  followUpQuestion: string | null
  confidence: number
  source: "gemini" | "fallback"
}

function fallbackHospitalSpeech(transcript: string): HospitalSpeechResult {
  const unavailable = /\b(no|not available|unavailable|cannot accept|can't accept|at capacity|full)\b/i.test(transcript)
  const available = !unavailable && /\b(yes|available|can accept|accepting|we can take)\b/i.test(transcript)
  const eta = transcript.match(/(\d{1,3})\s*(?:minute|min)\b/i)
  const capabilities = ["cardiac", "stroke", "trauma", "pediatric", "general"].filter((item) =>
    new RegExp(`\\b${item}\\b`, "i").test(transcript),
  )
  return {
    available: unavailable ? false : available ? true : null,
    offloadMinutes: eta ? Number(eta[1]) : null,
    capabilities,
    reason: unavailable ? transcript.slice(0, 180) : null,
    followUpQuestion: unavailable
      ? null
      : available && !eta
        ? "What is your estimated offload time in minutes?"
        : !available
          ? "To confirm, are you available to receive this patient? Please answer yes or no."
          : null,
    confidence: available || unavailable ? 0.72 : 0.25,
    source: "fallback",
  }
}

export async function interpretHospitalSpeech(transcript: string): Promise<HospitalSpeechResult> {
  const fallback = fallbackHospitalSpeech(transcript)
  const key = process.env.GEMINI_API_KEY
  if (!key || !transcript.trim()) return fallback
  const model = process.env.GEMINI_COORDINATION_MODEL ?? "gemini-3.1-flash-lite-preview"
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: `Extract the receiving hospital response. Availability must be true only for a clear acceptance, false for a clear refusal or capacity issue, and null when unclear. If availability is unclear, write a short yes-or-no follow-up question. If accepted but offload time is missing, ask for the estimated minutes. Otherwise followUpQuestion must be null. Transcript: ${JSON.stringify(transcript)}`,
            }],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                available: { type: "BOOLEAN", nullable: true },
                offloadMinutes: { type: "INTEGER", nullable: true },
                capabilities: { type: "ARRAY", items: { type: "STRING" } },
                reason: { type: "STRING", nullable: true },
                followUpQuestion: { type: "STRING", nullable: true },
                confidence: { type: "NUMBER" },
              },
              required: ["available", "offloadMinutes", "capabilities", "reason", "followUpQuestion", "confidence"],
            },
          },
        }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      },
    )
    if (!response.ok) return fallback
    const json = (await response.json()) as Record<string, unknown>
    const candidates = json.candidates as Array<Record<string, unknown>> | undefined
    const content = candidates?.[0]?.content as Record<string, unknown> | undefined
    const parts = content?.parts as Array<Record<string, unknown>> | undefined
    const text = parts?.find((part) => typeof part.text === "string")?.text
    const value = JSON.parse(typeof text === "string" ? text : "{}") as Record<string, unknown>
    return {
      available: typeof value.available === "boolean" ? value.available : null,
      offloadMinutes: Number.isFinite(Number(value.offloadMinutes)) ? Number(value.offloadMinutes) : null,
      capabilities: Array.isArray(value.capabilities) ? value.capabilities.map(String).slice(0, 8) : [],
      reason: typeof value.reason === "string" && value.reason ? value.reason.slice(0, 180) : null,
      followUpQuestion: typeof value.followUpQuestion === "string" && value.followUpQuestion
        ? value.followUpQuestion.slice(0, 220)
        : fallback.followUpQuestion,
      confidence: Math.max(0, Math.min(1, Number(value.confidence ?? 0.8))),
      source: "gemini",
    }
  } catch {
    return fallback
  }
}
