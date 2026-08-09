import { render, screen } from "@testing-library/react"
import { VitalsTrendChart } from "@/components/VitalsTrendChart"
import type { VitalReading } from "@/lib/derive"

const makeVital = (ts: number, hr: number, spo2: number): VitalReading => ({
  ts,
  hr,
  spo2,
  sbp: 120,
  dbp: 80,
  sourceEvent: { _id: `v${ts}`, _creationTime: ts, ts, type: "vital", source: "vision", role: "medic", payload: { hr, spo2 } },
})

it("renders chart container", () => {
  const { container } = render(
    <VitalsTrendChart vitals={[makeVital(1000, 100, 96), makeVital(2000, 105, 94)]} />
  )
  // Recharts renders an SVG
  expect(container.querySelector("svg")).toBeInTheDocument()
})

it("shows empty message with no vitals", () => {
  render(<VitalsTrendChart vitals={[]} />)
  expect(screen.getByText(/no vitals/i)).toBeInTheDocument()
})
