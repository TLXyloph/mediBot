export type EventType =
  | "utterance"
  | "vital"
  | "intervention"
  | "medication"
  | "symptom"
  | "correction"
  | "flag"
  | "protocol_state"
  | "timer"
  | "sbar_update"

export type EventSource = "voice" | "vision" | "agent" | "system"
export type EventRole = "medic" | "patient" | "partner" | "bystander"

export interface ConvexEvent {
  _id: string
  _creationTime: number
  ts: number
  type: EventType
  source: EventSource
  role: EventRole
  payload: Record<string, unknown>
  conf?: number
  refs?: string[]
}
