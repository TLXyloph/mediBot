import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { appendArgs } from "./lib/validators";

async function insertEvent(
  ctx: { db: any },
  args: any,
): Promise<string> {
  const ts = args.ts ?? Date.now();
  return await ctx.db.insert("events", {
    ts,
    type: args.type,
    source: args.source,
    role: args.role,
    payload: args.payload,
    conf: args.conf,
    refs: args.refs,
    processed: false,
  });
}

// Agent trigger routing lives HERE and nowhere else. Downstream agents are
// referenced by string name (makeFunctionReference), not by generated types, so
// each agent lane (safety/protocol/gap/sbar) can be added independently without
// touching this file — same string-coupling philosophy the lanes use.
const mut = (name: string) => makeFunctionReference<"mutation">(name);
const act = (name: string) => makeFunctionReference<"action">(name);

async function routeFollowups(
  ctx: { scheduler: any },
  id: string,
  type: string,
  fromPublic: boolean,
) {
  // Scribe (B2) runs only on real voice utterances, never on agent output → no loops.
  if (type === "utterance" && fromPublic) {
    await ctx.scheduler.runAfter(0, act("scribe:run"), { eventId: id });
  }
  // Safety (B3) checks every new drug/intervention — whether spoken or scribe-derived.
  if (type === "medication" || type === "intervention") {
    await ctx.scheduler.runAfter(0, mut("safety:run"), { eventId: id });
  }
  // SBAR (B5) rebuilds whenever clinically-relevant state changes. It emits only
  // sbar_update (not in this list), so no rebuild loop.
  if (["symptom", "medication", "vital", "flag", "protocol_state"].includes(type)) {
    await ctx.scheduler.runAfter(0, mut("sbar:rebuild"), {});
  }
}

// The single insert+route path. Agents in other files import this so all routing
// stays centralized. `fromPublic` gates the scribe so agents can't re-trigger it.
export async function insertAndRoute(
  ctx: { db: any; scheduler: any },
  args: any,
  fromPublic = false,
): Promise<string> {
  const id = await insertEvent(ctx, args);
  await routeFollowups(ctx, id, args.type, fromPublic);
  return id;
}

// Public append — the ONLY write path other lanes (voice/, eyes/) call.
// Called by string name from those lanes: anyApi.events.append.
export const append = mutation({
  args: appendArgs,
  handler: async (ctx, args) => await insertAndRoute(ctx, args, true),
});

// Agent-only write path (kept for callers that prefer a Convex function ref).
export const appendInternal = internalMutation({
  args: appendArgs,
  handler: async (ctx, args) => await insertAndRoute(ctx, args, false),
});

export const markProcessed = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.eventId, { processed: true });
  },
});

export const getEvent = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => await ctx.db.get(args.eventId),
});

// Reactive timeline for the dashboards. Called by string name: anyApi.events.timeline.
export const timeline = query({
  args: { since: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const since = args.since ?? 0;
    const rows = await ctx.db
      .query("events")
      .withIndex("by_ts", (q) => q.gte("ts", since))
      .order("asc")
      .collect();
    return args.limit ? rows.slice(-args.limit) : rows;
  },
});
