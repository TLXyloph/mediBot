import { coordinateHospitals } from "@/lib/server/a1mobile"
import type { CoordinationPatient } from "@/lib/coordination"

export const maxDuration = 60

function isPatient(value: unknown): value is CoordinationPatient {
  if (!value || typeof value !== "object") return false
  const patient = value as Partial<CoordinationPatient>
  const vitals = patient.vitals
  return (
    typeof patient.age === "number" &&
    patient.age > 0 &&
    typeof patient.chiefComplaint === "string" &&
    Array.isArray(patient.symptoms) &&
    Array.isArray(patient.medications) &&
    Array.isArray(patient.allergies) &&
    Array.isArray(patient.interventions) &&
    Boolean(vitals) &&
    [vitals?.hrBpm, vitals?.spo2Pct, vitals?.systolicMmHg, vitals?.diastolicMmHg].every(
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  )
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { patient?: unknown }
    if (!isPatient(body.patient)) {
      return Response.json({ error: "A complete patient snapshot is required" }, { status: 400 })
    }
    const origin = new URL(request.url).origin
    return Response.json(await coordinateHospitals(body.patient, origin))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hospital coordination failed"
    return Response.json({ error: message }, { status: 502 })
  }
}
