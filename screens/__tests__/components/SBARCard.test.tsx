import { render, screen } from "@testing-library/react"
import { SBARCard } from "@/components/SBARCard"
import { deriveEPCR } from "@/lib/derive"
import type { ConvexEvent } from "@/types/events"

const makeEvent = (overrides: Partial<ConvexEvent> & { type: ConvexEvent["type"] }): ConvexEvent => ({
  _id: Math.random().toString(36).slice(2),
  _creationTime: Date.now(),
  ts: Date.now(),
  source: "agent",
  role: "medic",
  payload: {},
  ...overrides,
})

it("shows SBAR text from the latest sbar_update event", () => {
  const events = [
    makeEvent({ type: "sbar_update", payload: { text: "S: chest pain; B: warfarin; A: none; R: ACS workup" } }),
  ]
  render(<SBARCard epcr={deriveEPCR(events)} />)
  expect(screen.getByText(/chest pain/i)).toBeInTheDocument()
})

it("shows placeholder when no SBAR yet", () => {
  render(<SBARCard epcr={deriveEPCR([])} />)
  expect(screen.getByText(/pending/i)).toBeInTheDocument()
})
