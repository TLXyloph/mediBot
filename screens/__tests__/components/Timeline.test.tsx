// screens/__tests__/components/Timeline.test.tsx
import { render, screen } from "@testing-library/react"
import { Timeline } from "@/components/Timeline"
import type { ConvexEvent } from "@/types/events"

const EVENTS: ConvexEvent[] = [
  {
    _id: "id1",
    _creationTime: 1000,
    ts: 1000,
    type: "utterance",
    source: "voice",
    role: "patient",
    payload: { text: "chest hurts" },
  },
  {
    _id: "id2",
    _creationTime: 2000,
    ts: 2000,
    type: "symptom",
    source: "agent",
    role: "patient",
    payload: { text: "chest pain reported" },
  },
]

it("renders each event type and payload text", () => {
  render(<Timeline events={EVENTS} />)
  expect(screen.getByText(/utterance/i)).toBeInTheDocument()
  expect(screen.getByText(/symptom/i)).toBeInTheDocument()
  expect(screen.getByText(/chest hurts/i)).toBeInTheDocument()
})

it("renders empty state when no events", () => {
  render(<Timeline events={[]} />)
  expect(screen.getByText(/waiting/i)).toBeInTheDocument()
})
