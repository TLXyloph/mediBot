// screens/__tests__/components/EPCRPanel.test.tsx
import { render, screen } from "@testing-library/react"
import { EPCRPanel } from "@/components/EPCRPanel"
import { deriveEPCR } from "@/lib/derive"
import type { ConvexEvent } from "@/types/events"

const BASE: ConvexEvent = {
  _id: "a",
  _creationTime: 1000,
  ts: 1000,
  type: "symptom",
  source: "agent",
  role: "patient",
  payload: { text: "chest pain" },
}

it("shows chief complaint text", () => {
  render(<EPCRPanel epcr={deriveEPCR([BASE])} />)
  expect(screen.getByText(/chest pain/i)).toBeInTheDocument()
})

it("shows vitals when vital events are present", () => {
  const vitalEvent: ConvexEvent = {
    ...BASE,
    _id: "b",
    type: "vital",
    payload: { hr: 110, spo2: 94, sbp: 130, dbp: 80 },
  }
  render(<EPCRPanel epcr={deriveEPCR([vitalEvent])} />)
  expect(screen.getByText(/110/)).toBeInTheDocument()
  expect(screen.getByText(/94/)).toBeInTheDocument()
})

it("shows empty dash for missing age", () => {
  render(<EPCRPanel epcr={deriveEPCR([])} />)
  expect(screen.getAllByText("—")).not.toHaveLength(0)
})
