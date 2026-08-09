import { answerPatientQuestion, latestVitals } from "@/lib/clinical"
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
})
