import {
  effectiveEvents,
  deriveEPCR,
  completeness,
  REQUIRED_FIELDS,
} from "@/lib/derive"
import type { ConvexEvent } from "@/types/events"

const makeEvent = (
  overrides: Partial<ConvexEvent> & { type: ConvexEvent["type"] }
): ConvexEvent => ({
  _id: Math.random().toString(36).slice(2),
  _creationTime: Date.now(),
  ts: Date.now(),
  source: "voice",
  role: "medic",
  payload: {},
  ...overrides,
})

describe("effectiveEvents", () => {
  it("removes events targeted by a correction's refs", () => {
    const original = makeEvent({ type: "symptom", payload: { text: "chest pain" } })
    const correction = makeEvent({
      type: "correction",
      payload: { text: "chest tightness" },
      refs: [original._id],
    })
    const result = effectiveEvents([original, correction])
    expect(result.map((e) => e._id)).not.toContain(original._id)
    expect(result.map((e) => e._id)).toContain(correction._id)
  })

  it("keeps events that have no correction targeting them", () => {
    const e = makeEvent({ type: "symptom", payload: { text: "headache" } })
    expect(effectiveEvents([e])).toHaveLength(1)
  })
})

describe("deriveEPCR", () => {
  it("extracts chiefComplaint from symptom events", () => {
    const events = [
      makeEvent({ type: "symptom", payload: { text: "chest hurts" } }),
      makeEvent({ type: "symptom", payload: { text: "takes warfarin" } }),
    ]
    const epcr = deriveEPCR(events)
    expect(epcr.chiefComplaint).toBe("chest hurts; takes warfarin")
  })

  it("extracts vitals from vital events", () => {
    const events = [
      makeEvent({ type: "vital", payload: { hr: 110, spo2: 94, sbp: 130, dbp: 80 } }),
    ]
    const epcr = deriveEPCR(events)
    expect(epcr.vitals).toHaveLength(1)
    expect(epcr.vitals[0].hr).toBe(110)
  })

  it("separates medications and interventions", () => {
    const events = [
      makeEvent({ type: "medication", payload: { name: "aspirin" } }),
      makeEvent({ type: "intervention", payload: { name: "IV access" } }),
    ]
    const epcr = deriveEPCR(events)
    expect(epcr.medications).toHaveLength(1)
    expect(epcr.interventions).toHaveLength(1)
  })
})

describe("completeness", () => {
  it("returns 0 for empty epcr", () => {
    expect(completeness(deriveEPCR([]))).toBe(0)
  })

  it("returns 1 when all required fields are present", () => {
    const events = [
      makeEvent({ type: "symptom", payload: { text: "chest pain" } }),
      makeEvent({ type: "utterance", payload: { age: "55" } }),
      makeEvent({ type: "vital", payload: { hr: 90 } }),
      makeEvent({ type: "medication", payload: { name: "aspirin" } }),
      makeEvent({ type: "intervention", payload: { name: "O2" } }),
    ]
    expect(completeness(deriveEPCR(events))).toBe(1)
  })
})

describe("REQUIRED_FIELDS", () => {
  it("has at least 5 entries", () => {
    expect(REQUIRED_FIELDS.length).toBeGreaterThanOrEqual(5)
  })
})
