// screens/__tests__/components/CompletenessBar.test.tsx
import { render, screen } from "@testing-library/react"
import { CompletenessBar } from "@/components/CompletenessBar"
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

it("shows 0% when no events", () => {
  render(<CompletenessBar epcr={deriveEPCR([])} />)
  expect(screen.getByText(/0%/i)).toBeInTheDocument()
})

it("shows 100% when all required fields present", () => {
  const events = [
    makeEvent({ type: "symptom", payload: { text: "chest pain" } }),
    makeEvent({ type: "utterance", payload: { age: "55" } }),
    makeEvent({ type: "vital", payload: { hr: 90 } }),
    makeEvent({ type: "medication", payload: { name: "aspirin" } }),
    makeEvent({ type: "intervention", payload: { name: "O2" } }),
  ]
  render(<CompletenessBar epcr={deriveEPCR(events)} />)
  expect(screen.getByText(/100%/i)).toBeInTheDocument()
})

it("renders a visual progress bar element", () => {
  render(<CompletenessBar epcr={deriveEPCR([])} />)
  expect(document.querySelector("[role='progressbar']")).toBeInTheDocument()
})
