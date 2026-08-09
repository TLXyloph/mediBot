import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { mutation, internalMutation } from "./_generated/server";
import { insertAndRoute } from "./events";

// B4 — Protocol state machine + timers (cardiac-arrest / ACLS).
//
// The LLM never owns timing. All periodic callouts (rhythm checks, epi due) are
// driven purely by the Convex scheduler, so they stay deterministic and testable.
// These timer events are consumed by the voice lane (spoken callouts).

// Reference downstream/self functions by STRING NAME only — no generated api import.
const mut = (n: string) => makeFunctionReference<"mutation">(n);

// Demo clock: "4x" (or "4") compresses wall-time so a 120s cycle fires at 30s.
const clock =
  parseFloat((process.env.DEMO_CLOCK || "1").replace(/x/i, "")) || 1;

// Base cadences (real ACLS intervals) divided by the demo clock.
const RHYTHM_BASE_SECONDS = 120; // rhythm check every 2 min
const EPI_BASE_SECONDS = 180; // epinephrine every 3 min

// baseSeconds * 1000 / clock  →  ms until the next fire.
const intervalMs = (baseSeconds: number) => (baseSeconds * 1000) / clock;

// Cap reschedules so a cloud backend never runs a scheduler away forever.
const MAX_N = 8;

// The active run = the latest protocol_state IF it's still "started". Each timer
// carries the runId it belongs to; a tick halts (no emit, no reschedule) if the
// run was stopped or superseded by a newer start. This is how `stop` and a fresh
// rehearsal cleanly kill a previous run's already-queued ticks — no dangling
// timers polluting the next run.
async function activeRunId(ctx: any): Promise<number | null> {
  const states = await ctx.db
    .query("events")
    .withIndex("by_type", (q: any) => q.eq("type", "protocol_state"))
    .collect();
  states.sort((a: any, b: any) => a.ts - b.ts);
  const latest = states[states.length - 1];
  if (!latest || latest.payload?.phase !== "started") return null;
  return latest.payload?.runId ?? null;
}

/**
 * start — begin a protocol run.
 * Emits the initial protocol_state and arms the first rhythm-check + epi timers.
 * Also kicks the gap agent (B5, separate lane) so it can request missing fields.
 */
export const start = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx: any, args) => {
    const rhythmIntervalMs = intervalMs(RHYTHM_BASE_SECONDS);
    const epiIntervalMs = intervalMs(EPI_BASE_SECONDS);
    // Unique id for THIS run; every timer this run schedules carries it.
    const runId = Date.now();

    // Announce that the protocol has started (supersedes any prior run).
    await insertAndRoute(ctx, {
      type: "protocol_state",
      source: "system",
      payload: {
        name: args.name ?? "arrest",
        phase: "started",
        startedAt: runId,
        runId,
      },
    });

    // Arm the first rhythm check and first epi dose (self-references by string name).
    await ctx.scheduler.runAfter(rhythmIntervalMs, mut("protocol:rhythmCheck"), {
      n: 1,
      runId,
    });
    await ctx.scheduler.runAfter(epiIntervalMs, mut("protocol:epi"), {
      n: 1,
      runId,
    });

    // Kick the gap agent (B5, different lane) so it can ask for missing fields
    // within 30s of protocol start. Scaled by the demo clock so it stays early.
    await ctx.scheduler.runAfter(Math.round(8000 / clock), mut("gap:check"), {});
  },
});

/**
 * rhythmCheck — periodic "pause compressions and check rhythm" callout.
 * Emits a timer event and reschedules itself until the cap is reached.
 */
export const rhythmCheck = internalMutation({
  args: { n: v.optional(v.number()), runId: v.optional(v.number()) },
  handler: async (ctx: any, args) => {
    // Halt if this run was stopped or superseded by a newer start.
    const active = await activeRunId(ctx);
    if (active === null || (args.runId != null && active !== args.runId)) return;

    const n = args.n ?? 1;
    const rhythmIntervalMs = intervalMs(RHYTHM_BASE_SECONDS);

    await insertAndRoute(ctx, {
      type: "timer",
      source: "system",
      payload: {
        name: "rhythm_check",
        message: "Rhythm check — pause compressions and check rhythm.",
        n,
      },
    });

    // Reschedule the next cycle, but cap to avoid runaway schedulers.
    if (n < MAX_N) {
      await ctx.scheduler.runAfter(
        rhythmIntervalMs,
        mut("protocol:rhythmCheck"),
        { n: n + 1, runId: args.runId },
      );
    }
  },
});

/**
 * epi — periodic "epinephrine due" callout.
 * Emits a timer event and reschedules itself until the cap is reached.
 */
export const epi = internalMutation({
  args: { n: v.optional(v.number()), runId: v.optional(v.number()) },
  handler: async (ctx: any, args) => {
    // Halt if this run was stopped or superseded by a newer start.
    const active = await activeRunId(ctx);
    if (active === null || (args.runId != null && active !== args.runId)) return;

    const n = args.n ?? 1;
    const epiIntervalMs = intervalMs(EPI_BASE_SECONDS);

    await insertAndRoute(ctx, {
      type: "timer",
      source: "system",
      payload: {
        name: "epi_due",
        message: "Epinephrine due — 1 mg IV/IO.",
        n,
      },
    });

    // Reschedule the next dose, but cap to avoid runaway schedulers.
    if (n < MAX_N) {
      await ctx.scheduler.runAfter(epiIntervalMs, mut("protocol:epi"), {
        n: n + 1,
        runId: args.runId,
      });
    }
  },
});

/**
 * stop — halt the active protocol run. Emits a "stopped" protocol_state, which
 * makes every in-flight rhythmCheck/epi tick halt on its next fire (they check
 * the active run first). Public so the voice lane can call anyApi.protocol.stop
 * ("MediBot, stop the protocol"). Idempotent — safe to call when nothing is running.
 */
export const stop = mutation({
  args: {},
  handler: async (ctx: any) => {
    await insertAndRoute(ctx, {
      type: "protocol_state",
      source: "system",
      payload: { name: "arrest", phase: "stopped", stoppedAt: Date.now() },
    });
  },
});
