import { v } from "convex/values";

// The contract from docs/handoff.md. Everything couples through the `events` table.
export const eventType = v.union(
  v.literal("utterance"),
  v.literal("vital"),
  v.literal("intervention"),
  v.literal("medication"),
  v.literal("symptom"),
  v.literal("correction"),
  v.literal("flag"),
  v.literal("protocol_state"),
  v.literal("timer"),
  v.literal("sbar_update"),
);

export const eventSource = v.union(
  v.literal("voice"),
  v.literal("vision"),
  v.literal("agent"),
  v.literal("system"),
);

export const eventRole = v.union(
  v.literal("medic"),
  v.literal("patient"),
  v.literal("partner"),
  v.literal("bystander"),
);

// Args accepted by append / appendInternal. `ts` optional (defaults to now).
export const appendArgs = {
  type: eventType,
  source: eventSource,
  role: v.optional(eventRole),
  payload: v.any(),
  conf: v.optional(v.number()),
  // refs are event ids as strings (kept string, not v.id, so hand-inserted test
  // events and cross-lane callers don't need a valid Id to reference).
  refs: v.optional(v.array(v.string())),
  ts: v.optional(v.number()),
};

// Full stored column set = append args (minus optional ts, which is always resolved) + processed marker.
export const eventColumns = {
  ts: v.number(),
  type: eventType,
  source: eventSource,
  role: v.optional(eventRole),
  payload: v.any(),
  conf: v.optional(v.number()),
  refs: v.optional(v.array(v.string())),
  // idempotency marker so an agent that re-runs on an event doesn't double-emit.
  processed: v.optional(v.boolean()),
};
