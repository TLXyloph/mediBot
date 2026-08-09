import type { ConvexEvent } from "@/types/events"

export interface VitalReading {
  ts: number
  hr?: number
  spo2?: number
  sbp?: number
  dbp?: number
  sourceEvent: ConvexEvent
}

export interface EPCRData {
  chiefComplaint: string
  age: string
  vitals: VitalReading[]
  medications: ConvexEvent[]
  interventions: ConvexEvent[]
  flags: ConvexEvent[]
  sbarUpdates: ConvexEvent[]
  allEvents: ConvexEvent[]
}

/** Strip events that have been superseded by a correction's refs array. */
export function effectiveEvents(events: ConvexEvent[]): ConvexEvent[] {
  const correctedIds = new Set(
    events
      .filter((e) => e.type === "correction")
      .flatMap((e) => e.refs ?? [])
  )
  return events.filter((e) => !correctedIds.has(e._id))
}

/** Derive all ePCR fields from the raw event log. */
export function deriveEPCR(events: ConvexEvent[]): EPCRData {
  const eff = effectiveEvents(events)

  const chiefComplaint = eff
    .filter((e) => e.type === "symptom")
    .map((e) => String(e.payload.text ?? ""))
    .filter(Boolean)
    .join("; ")

  const ageEvent = eff.find(
    (e) => (e.type === "utterance" || e.type === "symptom") && e.payload.age != null
  )
  const age = ageEvent ? String(ageEvent.payload.age) : ""

  // Accumulate vitals: handle both named-field format {hr,spo2,sbp,dbp} (Lane D)
  // and {name,value} format (Lane B scribe). Multiple {name,value} events are
  // merged into a single reading per timestamp group.
  const vitalMap = new Map<number, VitalReading>()
  eff.filter((e) => e.type === "vital").forEach((e) => {
    const p = e.payload
    const existing = vitalMap.get(e.ts) ?? { ts: e.ts, sourceEvent: e }
    if (p.name != null && p.value != null) {
      const name = String(p.name).toLowerCase()
      if (name === "hr" || name === "heart rate") (existing as any).hr = Number(p.value)
      else if (name === "spo2" || name === "spo₂" || name === "oxygen") (existing as any).spo2 = Number(p.value)
      else if (name === "sbp" || name === "systolic") (existing as any).sbp = Number(p.value)
      else if (name === "dbp" || name === "diastolic") (existing as any).dbp = Number(p.value)
    } else {
      if (p.hr != null) (existing as any).hr = p.hr as number
      if (p.spo2 != null) (existing as any).spo2 = p.spo2 as number
      if (p.sbp != null) (existing as any).sbp = p.sbp as number
      if (p.dbp != null) (existing as any).dbp = p.dbp as number
    }
    vitalMap.set(e.ts, existing as VitalReading)
  })
  const vitals: VitalReading[] = Array.from(vitalMap.values()).sort((a, b) => a.ts - b.ts)

  return {
    chiefComplaint,
    age,
    vitals,
    medications: eff.filter((e) => e.type === "medication"),
    interventions: eff.filter((e) => e.type === "intervention"),
    flags: eff.filter((e) => e.type === "flag"),
    // Corrections don't apply to sbar_update (narrative text replaces itself)
    sbarUpdates: events.filter((e) => e.type === "sbar_update"),
    allEvents: events,
  }
}

export const REQUIRED_FIELDS: { key: keyof EPCRData; label: string }[] = [
  { key: "chiefComplaint", label: "Chief Complaint" },
  { key: "age", label: "Age" },
  { key: "vitals", label: "Vitals" },
  { key: "medications", label: "Medications" },
  { key: "interventions", label: "Interventions" },
]

/** Returns 0–1 fraction of required fields that are non-empty. */
export function completeness(epcr: EPCRData): number {
  const filled = REQUIRED_FIELDS.filter(({ key }) => {
    const val = epcr[key]
    if (typeof val === "string") return val.length > 0
    if (Array.isArray(val)) return val.length > 0
    return false
  }).length
  return filled / REQUIRED_FIELDS.length
}
