// The one contract everything couples through (docs/handoff.md "The contract").
// Append-only events table in Convex; this file mirrors it for lane A.

export const EVENT_TYPES = [
  "utterance",
  "vital",
  "intervention",
  "medication",
  "symptom",
  "correction",
  "flag",
  "protocol_state",
  "timer",
  "sbar_update",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type Source = "voice" | "vision" | "agent" | "system";
export type Role = "medic" | "patient" | "partner" | "bystander";

export interface MediBotEvent {
  ts: number;
  type: EventType;
  source: Source;
  /** null = unattributed; lane B's scribe agent attributes roles from content. */
  role: Role | null;
  payload: Record<string, unknown>;
  conf: number;
  refs: string[];
}

export function makeEvent(
  type: EventType,
  payload: Record<string, unknown>,
  opts: { role?: Role | null; source?: Source; conf?: number; refs?: string[] } = {},
): MediBotEvent {
  return {
    ts: Date.now(),
    type,
    source: opts.source ?? "voice",
    role: opts.role ?? null,
    payload,
    conf: opts.conf ?? 1,
    refs: opts.refs ?? [],
  };
}
