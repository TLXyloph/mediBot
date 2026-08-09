import { query } from "./_generated/server";

// Live SBAR card for the hospital view (R9). Returns the latest sbar_update
// payload the SBAR agent (B5) maintains; falls back to an empty shell before
// that agent is running so the view always renders.
// Called by string name: anyApi.sbar.sbar.
export const sbar = query({
  args: {},
  handler: async (ctx) => {
    const updates = await ctx.db
      .query("events")
      .withIndex("by_type", (q) => q.eq("type", "sbar_update"))
      .collect();

    if (updates.length) {
      updates.sort((a, b) => a.ts - b.ts);
      return { ...updates[updates.length - 1].payload, _derived: false };
    }

    return {
      situation: null,
      background: null,
      assessment: null,
      recommendation: null,
      _derived: true,
    };
  },
});
