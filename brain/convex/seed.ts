import { mutation } from "./_generated/server";

// `npx convex run seed:demo` — inserts the scripted demo beats so screens/ and
// eyes/ have data to render before voice/ is wired. Safe to run repeatedly
// (it only appends; the log is append-only by design).
export const demo = mutation({
  args: {},
  handler: async (ctx) => {
    const t0 = Date.now();
    const ids: string[] = [];
    const put = async (e: any) => {
      const id = await ctx.db.insert("events", { processed: false, ...e });
      ids.push(id);
      return id;
    };

    await put({
      ts: t0,
      type: "utterance",
      source: "voice",
      role: "patient",
      payload: { text: "chest hurts... I take warfarin" },
      conf: 0.9,
    });
    await put({
      ts: t0 + 200,
      type: "symptom",
      source: "agent",
      role: "patient",
      payload: { text: "chest pain" },
      conf: 0.9,
    });
    await put({
      ts: t0 + 200,
      type: "medication",
      source: "agent",
      role: "patient",
      payload: { name: "warfarin" },
      conf: 0.9,
    });
    await put({
      ts: t0 + 5000,
      type: "vital",
      source: "vision",
      payload: { name: "HR", value: 120 },
      conf: 0.8,
    });

    return { inserted: ids.length };
  },
});
