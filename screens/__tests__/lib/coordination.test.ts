import { rankHospitalResults, receivingRequirements, type CoordinationPatient } from "@/lib/coordination"

const patient: CoordinationPatient = {
  age: 54,
  chiefComplaint: "crushing chest pain with hypotension",
  symptoms: ["chest pain"],
  medications: [],
  allergies: [],
  interventions: [],
  vitals: { hrBpm: 108, spo2Pct: 94, systolicMmHg: 90, diastolicMmHg: 60 },
}

describe("hospital coordination", () => {
  it("requires cardiac capability for chest pain with hypotension", () => {
    expect(receivingRequirements(patient).capabilities).toEqual(["general", "cardiac"])
  })

  it("ranks total travel plus offload and rejects missing capability", () => {
    const ranked = rankHospitalResults([
      { id: "a", name: "A", travelMinutes: 12, offloadMinutes: 18, accepted: true, capabilities: ["general", "cardiac"], callPlaced: false },
      { id: "b", name: "B", travelMinutes: 8, offloadMinutes: 52, accepted: true, capabilities: ["general", "cardiac"], callPlaced: false },
      { id: "c", name: "C", travelMinutes: 4, offloadMinutes: 4, accepted: true, capabilities: ["general"], callPlaced: false },
    ], ["general", "cardiac"])
    expect(ranked.map((hospital) => hospital.id)).toEqual(["a", "b", "c"])
    expect(ranked[0]?.score).toBe(30)
    expect(ranked[2]?.eligible).toBe(false)
  })
})
