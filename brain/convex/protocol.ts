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

    // Announce that the protocol has started.
    await insertAndRoute(ctx, {
      type: "protocol_state",
      source: "system",
      payload: {
        name: args.name ?? "arrest",
        phase: "started",
        startedAt: Date.now(),
      },
    });

    // Arm the first rhythm check and first epi dose (self-references by string name).
    await ctx.scheduler.runAfter(rhythmIntervalMs, mut("protocol:rhythmCheck"), {
      n: 1,
    });
    await ctx.scheduler.runAfter(epiIntervalMs, mut("protocol:epi"), { n: 1 });

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
  args: { n: v.optional(v.number()) },
  handler: async (ctx: any, args) => {
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
        { n: n + 1 },
      );
    }
  },
});

/**
 * epi — periodic "epinephrine due" callout.
 * Emits a timer event and reschedules itself until the cap is reached.
 */
export const epi = internalMutation({
  args: { n: v.optional(v.number()) },
  handler: async (ctx: any, args) => {
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
      });
    }
  },
});
