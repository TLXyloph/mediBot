import { render, screen } from "@testing-library/react"
import { InterventionsList } from "@/components/InterventionsList"
import { deriveEPCR } from "@/lib/derive"
import type { ConvexEvent } from "@/types/events"

const makeEvent = (overrides: Partial<ConvexEvent> & { type: ConvexEvent["type"] }): ConvexEvent => ({
  _id: Math.random().toString(36).slice(2),
  _creationTime: Date.now(),
  ts: Date.now(),
  source: "voice",
  role: "medic",
  payload: {},
  ...overrides,
})

it("shows medication and intervention names", () => {
  const events = [
    makeEvent({ type: "medication", payload: { name: "Aspirin 325mg" } }),
    makeEvent({ type: "intervention", payload: { name: "IV access" } }),
  ]
  render(<InterventionsList epcr={deriveEPCR(events)} />)
  expect(screen.getByText(/Aspirin 325mg/i)).toBeInTheDocument()
  expect(screen.getByText(/IV access/i)).toBeInTheDocument()
})

it("shows empty state when no interventions or meds", () => {
  render(<InterventionsList epcr={deriveEPCR([])} />)
  expect(screen.getByText(/none yet/i)).toBeInTheDocument()
})
