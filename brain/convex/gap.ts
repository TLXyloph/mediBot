import { internalMutation } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { insertAndRoute } from "./events";

// B5 Gap agent (R5): a missing required field (e.g. patient age) is asked for by
// voice within 30s of protocol start, but NEVER during an utterance burst — we
// defer while the medic is mid-sentence so we don't talk over them.

// Schedule sibling agents by string name (no ./_generated/api import).
const mut = (n: string) => makeFunctionReference<"mutation">(n);

// Required fields to backfill. Kept as a small array so it's trivial to extend.
const REQUIRED_FIELDS = ["age"];
const FIELD_PROMPTS: Record<string, string> = {
  age: "What is the patient's age?",
};

// If the medic spoke within this window, treat them as mid-burst and defer.
const QUIET_MS = 4000;

export const check = internalMutation({
  args: {},
  handler: async (ctx: any) => {
    // 1. Load the full log (ascending).
    const events: any[] = await ctx.db
      .query("events")
      .withIndex("by_ts")
      .order("asc")
      .collect();

    // 2. A field is KNOWN if any event payload carries it; else MISSING.
    const missing = REQUIRED_FIELDS.filter(
      (field) => !events.some((e) => e.payload && e.payload[field] != null),
    );

    // Nothing missing → nothing to ask, don't reschedule.
    if (missing.length === 0) return;

    // 3. Quiet-moment heuristic: if the medic spoke very recently, defer.
    const lastUtteranceTs = events
      .filter((e) => e.type === "utterance")
      .reduce((max, e) => (e.ts > max ? e.ts : max), 0);
    if (Date.now() - lastUtteranceTs < QUIET_MS) {
      // Mid-sentence: reschedule and ask nothing now (never interrupt a burst).
      await ctx.scheduler.runAfter(QUIET_MS, mut("gap:check"), {});
      return;
    }

    // 4. Dedupe: skip fields already asked via a prior gap flag.
    const asked = new Set(
      events
        .filter(
          (e) =>
            e.type === "flag" &&
            e.payload &&
            e.payload.kind === "gap" &&
            e.payload.field,
        )
        .map((e) => e.payload.field),
    );
    const unasked = missing.filter((field) => !asked.has(field));

    // Nothing left to ask (all missing fields already prompted) → done.
    if (unasked.length === 0) return;

    // 5. Ask the first missing, not-yet-asked field by voice.
    const field = unasked[0];
    await insertAndRoute(ctx, {
      type: "flag",
      source: "agent",
      payload: {
        kind: "gap",
        severity: "info",
        field,
        message: FIELD_PROMPTS[field],
        speak: true,
      },
    });

    // 6. If more fields still need asking, reschedule so we ask the next one
    // later (still honoring the quiet heuristic on that run).
    if (unasked.length > 1) {
      await ctx.scheduler.runAfter(QUIET_MS, mut("gap:check"), {});
    }
  },
});
