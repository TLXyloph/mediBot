import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
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

// Public append — the ONLY write path other lanes (voice/, eyes/) call.
// Called by string name from those lanes: anyApi.events.append.
export const append = mutation({
  args: appendArgs,
  handler: async (ctx, args) => {
    const id = await insertEvent(ctx, args);

    // Reactive-agent trigger. This is the piece the plan depends on but never
    // named: an utterance schedules the scribe to extract typed events from it.
    // runAfter(0, ...) hands off to a durable action after this mutation commits.
    if (args.type === "utterance") {
      await ctx.scheduler.runAfter(0, internal.scribe.run, { eventId: id });
    }
    return id;
  },
});

// Agent-only write path. Agents append via this so they never re-trigger the
// scribe (only public `append` schedules follow-up work).
export const appendInternal = internalMutation({
  args: appendArgs,
  handler: async (ctx, args) => await insertEvent(ctx, args),
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
