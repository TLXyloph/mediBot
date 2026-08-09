import { query } from "./_generated/server";

const EPI_RE = /epi\b|epinephrine|adrenaline/i;

// Fast state summary the safety agent (B3) and Q&A (R11) read against:
// meds / allergies / last-epi / protocol position.
// Called by string name: anyApi.patientState.patientState.
export const patientState = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_ts")
      .order("asc")
      .collect();

    const medications = events
      .filter((e) => e.type === "medication")
      .map((e) => ({
        name: e.payload?.name ?? e.payload?.text ?? String(e.payload ?? ""),
        role: e.role ?? null,
        ts: e.ts,
        eventId: e._id,
      }));

    const allergies = events
      .filter((e) => e.type === "symptom" && e.payload?.allergy)
      .map((e) => e.payload.allergy);

    const epiEvents = events.filter(
      (e) =>
        (e.type === "medication" || e.type === "intervention") &&
        EPI_RE.test(JSON.stringify(e.payload ?? "")),
    );
    const lastEpi = epiEvents.length ? epiEvents[epiEvents.length - 1].ts : null;

    const protocolStates = events.filter((e) => e.type === "protocol_state");
    const protocolPosition = protocolStates.length
      ? protocolStates[protocolStates.length - 1].payload
      : null;

    return { medications, allergies, lastEpi, protocolPosition };
  },
});
