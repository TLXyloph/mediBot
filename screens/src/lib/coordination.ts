export type Capability = "general" | "cardiac" | "stroke" | "trauma" | "pediatric" | "burn"

export interface CoordinationPatient {
  age: number
  sex?: string
  chiefComplaint: string
  symptoms: string[]
  medications: string[]
  allergies: string[]
  interventions: string[]
  vitals: {
    hrBpm: number
    spo2Pct: number
    systolicMmHg: number
    diastolicMmHg: number
  }
}

export interface HospitalResult {
  id: string
  name: string
  travelMinutes: number
  offloadMinutes: number | null
  accepted: boolean
  capabilities: Capability[]
  reason?: string
  score: number | null
  eligible: boolean
  callPlaced: boolean
}

export interface CoordinationResult {
  caseId: string
  mode: "demo" | "live"
  requirements: { capabilities: Capability[]; acuity: "high" | "moderate" | "low"; rationale: string }
  sbar: string
  hospitals: HospitalResult[]
  recommendedHospitalId: string | null
  createdAt: number
}

export function receivingRequirements(patient: CoordinationPatient): CoordinationResult["requirements"] {
  const text = `${patient.chiefComplaint} ${patient.symptoms.join(" ")}`.toLowerCase()
  const capabilities = new Set<Capability>(["general"])
  if (/chest|cardiac|stemi|hypotension/.test(text) || patient.vitals.systolicMmHg < 100) {
    capabilities.add("cardiac")
  }
  if (/stroke|facial droop|weakness|aphasia/.test(text)) capabilities.add("stroke")
  if (/trauma|collision|fall|gunshot/.test(text)) capabilities.add("trauma")
  if (patient.age < 16) capabilities.add("pediatric")
  const high = patient.vitals.systolicMmHg < 90 || patient.vitals.spo2Pct < 90
  const moderate = patient.vitals.systolicMmHg < 105 || patient.vitals.hrBpm > 110
  return {
    capabilities: [...capabilities],
    acuity: high ? "high" : moderate ? "moderate" : "low",
    rationale: `${[...capabilities].join(" + ")} capability required from verified complaint and vitals.`,
  }
}

export function rankHospitalResults(
  hospitals: Omit<HospitalResult, "score" | "eligible">[],
  required: Capability[],
): HospitalResult[] {
  return hospitals
    .map((hospital) => {
      const capable = required.every((capability) => hospital.capabilities.includes(capability))
      const eligible = hospital.accepted && capable && hospital.offloadMinutes !== null
      return {
        ...hospital,
        eligible,
        score: eligible ? hospital.travelMinutes + hospital.offloadMinutes! : null,
      }
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1
      return (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY)
    })
}
