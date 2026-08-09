import { answerFromPatientState, answerPatientQuestion, latestVitals } from "@/lib/clinical"
import type { ConvexEvent } from "@/types/events"

function event(ts: number, type: ConvexEvent["type"], payload: Record<string, unknown>): ConvexEvent {
  return { _id: `event-${ts}-${String(payload.name ?? type)}`, _creationTime: ts, ts, type, source: "vision", role: "medic", payload }
}

describe("clinical state helpers", () => {
  it("merges four same-timestamp vital events", () => {
    const events = [
      event(100, "vital", { name: "hr", value: 108 }),
      event(100, "vital", { name: "spo2", value: 94 }),
      event(100, "vital", { name: "sbp", value: 90 }),
      event(100, "vital", { name: "dbp", value: 60 }),
    ]
    expect(latestVitals(events)).toEqual({ hrBpm: 108, spo2Pct: 94, systolicMmHg: 90, diastolicMmHg: 60, ts: 100 })
  })

  it("answers last epi only from the verified event timeline", () => {
    const events = [event(new Date("2026-08-09T20:15:00Z").getTime(), "medication", { name: "epinephrine", dose: "1 mg" })]
    expect(answerPatientQuestion("MedCrew, when was the last epi?", events)).toMatch(/last epinephrine was recorded/i)
  })

  it("answerFromPatientState prefers the backend lastEpi over the event log", () => {
    const backendTs = new Date("2026-08-09T20:15:00Z").getTime()
    const answer = answerFromPatientState("MedCrew, when was the last epi?", { lastEpi: backendTs }, [])
    expect(answer).toMatch(/last epinephrine was recorded/i)
  })

  it("answerFromPatientState reads medications from the canonical patient state", () => {
    const answer = answerFromPatientState("what meds is the patient taking?", { medications: [{ name: "warfarin" }] }, [])
    expect(answer).toMatch(/warfarin/i)
  })

  it("answerFromPatientState falls back to the event log when state has not loaded", () => {
    const events = [event(new Date("2026-08-09T20:15:00Z").getTime(), "medication", { name: "epinephrine" })]
    expect(answerFromPatientState("when was the last epi?", undefined, events)).toMatch(/last epinephrine was recorded/i)
  })
})
