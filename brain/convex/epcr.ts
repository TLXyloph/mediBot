import { query } from "./_generated/server";

// Derived ePCR view. Every populated field carries its provenance (source
// utterance text + ts + eventId) so the medic view can satisfy R7 on tap.
// Called by string name: anyApi.epcr.epcr.
export const epcr = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_ts")
      .order("asc")
      .collect();

    const utteranceById = new Map(
      events.filter((e) => e.type === "utterance").map((e) => [e._id as string, e]),
    );

    const provenance = (e: any) => {
      const src = (e.refs ?? [])
        .map((r: string) => utteranceById.get(r))
        .find(Boolean);
      return src
        ? { text: src.payload?.text ?? src.payload, ts: src.ts, eventId: src._id }
        : null;
    };

    const withProv = (e: any) => ({
      value: e.payload,
      ts: e.ts,
      role: e.role ?? null,
      conf: e.conf ?? null,
      eventId: e._id,
      source: provenance(e),
    });

    const byType = (t: string) => events.filter((e) => e.type === t).map(withProv);

    // Latest vital wins per name (events are in ascending ts order).
    const vitals: Record<string, any> = {};
    for (const e of events) {
      if (e.type !== "vital") continue;
      const name = e.payload?.name ?? "unknown";
      vitals[name] = withProv(e);
    }

    return {
      symptoms: byType("symptom"),
      medications: byType("medication"),
      interventions: byType("intervention"),
      flags: byType("flag"),
      corrections: byType("correction"),
      vitals,
    };
  },
});
