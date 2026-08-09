import { render, screen } from "@testing-library/react"
import { FlagFlash } from "@/components/FlagFlash"
import type { ConvexEvent } from "@/types/events"

const makeFlag = (id: string): ConvexEvent => ({
  _id: id,
  _creationTime: Date.now(),
  ts: Date.now(),
  type: "flag",
  source: "agent",
  role: "medic",
  payload: { message: "Drug interaction: warfarin + aspirin" },
})

it("renders without crashing when no flags", () => {
  const { container } = render(<FlagFlash flags={[]} />)
  expect(container).toBeTruthy()
})

it("shows the most recent flag message", () => {
  render(<FlagFlash flags={[makeFlag("f1")]} />)
  expect(screen.getByText(/warfarin/i)).toBeInTheDocument()
})
