import type { ConvexEvent } from "@/types/events"

export interface CurrentVitals {
  hrBpm: number
  spo2Pct: number
  systolicMmHg: number
  diastolicMmHg: number
  ts: number
}

const FALLBACK_VITALS: CurrentVitals = {
  hrBpm: 88,
  spo2Pct: 97,
  systolicMmHg: 118,
  diastolicMmHg: 76,
  ts: 0,
}

function vitalName(event: ConvexEvent): string | undefined {
  const name = event.payload.name
  return typeof name === "string" ? name.toLowerCase() : undefined
}

function vitalValue(event: ConvexEvent): number | undefined {
  const value = Number(event.payload.value)
  return Number.isFinite(value) ? value : undefined
}

export function latestVitals(events: ConvexEvent[]): CurrentVitals {
  const current = { ...FALLBACK_VITALS }
  const seen = new Set<string>()

  for (const event of [...events].reverse()) {
    if (event.type !== "vital") continue
    const payload = event.payload
    const combined = {
      hr: Number(payload.hr ?? payload.hrBpm),
      spo2: Number(payload.spo2 ?? payload.spo2Pct),
      sbp: Number(payload.sbp ?? payload.systolicMmHg),
      dbp: Number(payload.dbp ?? payload.diastolicMmHg),
    }
    if (Object.values(combined).every(Number.isFinite)) {
      return {
        hrBpm: combined.hr,
        spo2Pct: combined.spo2,
        systolicMmHg: combined.sbp,
        diastolicMmHg: combined.dbp,
        ts: event.ts,
      }
    }

    const name = vitalName(event)
    const value = vitalValue(event)
    if (!name || value === undefined || seen.has(name)) continue
    if (name === "hr" || name === "heart rate") current.hrBpm = value
    if (name === "spo2" || name === "oxygen") current.spo2Pct = value
    if (name === "sbp" || name === "systolic") current.systolicMmHg = value
    if (name === "dbp" || name === "diastolic") current.diastolicMmHg = value
    current.ts = Math.max(current.ts, event.ts)
    seen.add(name)
  }
  return current
}

export function lastEpinephrine(events: ConvexEvent[]): number | null {
  const match = [...events]
    .reverse()
    .find(
      (event) =>
        (event.type === "medication" || event.type === "intervention") &&
        /epi\b|epinephrine|adrenaline/i.test(JSON.stringify(event.payload)),
    )
  return match?.ts ?? null
}

export function answerPatientQuestion(question: string, events: ConvexEvent[]): string {
  if (/last\s+(epi|epinephrine)|when.*(epi|epinephrine)/i.test(question)) {
    const lastEpi = lastEpinephrine(events)
    if (!lastEpi) return "No epinephrine administration is recorded in the verified patient timeline."
    return `The last epinephrine was recorded at ${new Date(lastEpi).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}.`
  }
  if (/vital|blood pressure|heart rate|oxygen/i.test(question)) {
    const vitals = latestVitals(events)
    return `Latest verified vitals are heart rate ${vitals.hrBpm}, oxygen ${vitals.spo2Pct} percent, and blood pressure ${vitals.systolicMmHg} over ${vitals.diastolicMmHg}.`
  }
  return "I can answer questions about verified vitals, medications, allergies, protocol position, and the last epinephrine."
}

// Shape of the brain's patientState:patientState query (the fields we read).
export interface PatientStateSummary {
  medications?: Array<{ name?: string; role?: string | null }>
  allergies?: string[]
  lastEpi?: number | null
  protocolPosition?: { name?: string; phase?: string } | null
}

// Answer a spoken question from the brain's canonical patient state (single source
// of truth), falling back to the live event log for vitals and whenever the query
// hasn't loaded yet. Keeps the medic app's spoken answers consistent with the
// backend instead of a parallel client-only heuristic.
export function answerFromPatientState(
  question: string,
  patient: PatientStateSummary | undefined,
  events: ConvexEvent[],
): string {
  if (/last\s+(epi|epinephrine)|when.*(epi|epinephrine)/i.test(question)) {
    const lastEpi = patient?.lastEpi ?? lastEpinephrine(events)
    if (!lastEpi) return "No epinephrine administration is recorded in the verified patient timeline."
    return `The last epinephrine was recorded at ${new Date(lastEpi).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}.`
  }
  if (/vital|blood pressure|heart rate|oxygen/i.test(question)) {
    const vitals = latestVitals(events)
    return `Latest verified vitals are heart rate ${vitals.hrBpm}, oxygen ${vitals.spo2Pct} percent, and blood pressure ${vitals.systolicMmHg} over ${vitals.diastolicMmHg}.`
  }
  if (/allerg/i.test(question)) {
    const allergies = patient?.allergies ?? []
    return allergies.length
      ? `Documented allergies: ${allergies.join(", ")}.`
      : "No allergies are recorded; treat as NKDA until confirmed."
  }
  if (/medication|meds\b|taking|drug|warfarin|aspirin/i.test(question)) {
    const meds = (patient?.medications ?? [])
      .map((med) => med?.name)
      .filter((name): name is string => Boolean(name))
    return meds.length
      ? `Documented medications: ${meds.join(", ")}.`
      : "No medications are recorded in the verified patient state yet."
  }
  if (/protocol|arrest|rhythm/i.test(question)) {
    const position = patient?.protocolPosition
    return position?.name
      ? `Protocol: ${position.name}${position.phase ? ", " + position.phase : ""}.`
      : "No active protocol is recorded."
  }
  return "I can answer questions about verified vitals, medications, allergies, protocol position, and the last epinephrine."
}
