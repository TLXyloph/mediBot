import { query, internalMutation } from "./_generated/server";
import { insertAndRoute } from "./events";

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

// B5 SBAR agent: deterministically assemble an SBAR from the append-only log and
// emit a fresh sbar_update ONLY when the content actually changed (no spam).
// Scheduled by string name from the router: mut("sbar:rebuild").
export const rebuild = internalMutation({
  args: {},
  handler: async (ctx: any) => {
    // 1. Load the full log (ascending).
    const events: any[] = await ctx.db
      .query("events")
      .withIndex("by_ts")
      .order("asc")
      .collect();

    // 2. Derive the clinical facts we need.
    const symptoms = events.filter((e) => e.type === "symptom");
    const meds = events.filter((e) => e.type === "medication");

    // Chief complaint = text of the first symptom event.
    const chiefComplaint =
      symptoms.length && symptoms[0].payload
        ? symptoms[0].payload.text ?? null
        : null;

    // Home meds = patient-reported; given meds = administered by medic/partner.
    const homeMeds = meds
      .filter((e) => e.role === "patient")
      .map((e) => e.payload?.name)
      .filter((n) => n != null);
    const givenMeds = meds
      .filter((e) => e.role === "medic" || e.role === "partner")
      .map((e) => e.payload?.name)
      .filter((n) => n != null);

    // Allergies pulled from symptom payloads carrying one.
    const allergies = symptoms
      .map((e) => e.payload?.allergy)
      .filter((a) => a != null);

    // Latest vitals: name -> value, last write wins over ascending order.
    const latestVitals: Record<string, any> = {};
    for (const e of events) {
      if (e.type === "vital" && e.payload && e.payload.name != null) {
        latestVitals[e.payload.name] = e.payload.value;
      }
    }

    // Safety alerts raised by the safety agent.
    const safetyAlerts = events
      .filter(
        (e) => e.type === "flag" && e.payload && e.payload.kind === "safety",
      )
      .map((e) => e.payload.reason ?? e.payload.message)
      .filter((m) => m != null);

    // Latest protocol state.
    const protocolEvents = events.filter((e) => e.type === "protocol_state");
    const protocol = protocolEvents.length
      ? protocolEvents[protocolEvents.length - 1].payload
      : null;

    // 3. Build the four SBAR strings.
    const situation = `${
      chiefComplaint ? "Chief complaint: " + chiefComplaint : "Assessment in progress"
    }${protocol ? "; " + protocol.name + " protocol " + protocol.phase : ""}.`;

    const background = `Home meds: ${
      homeMeds.join(", ") || "none noted"
    }. Allergies: ${allergies.join(", ") || "NKDA"}.`;

    const assessment = `Vitals: ${
      Object.entries(latestVitals)
        .map(([k, val]) => k + " " + val)
        .join(", ") || "pending"
    }.${safetyAlerts.length ? " Alerts: " + safetyAlerts.join("; ") + "." : ""}`;

    const recommendation = safetyAlerts.length
      ? "Hold conflicting meds; prepare accordingly. Notify receiving team."
      : "Continue protocol; notify receiving team.";

    const next = { situation, background, assessment, recommendation };

    // 4. Compare against the last sbar_update; skip if unchanged (no-op).
    const updates = events.filter((e) => e.type === "sbar_update");
    const prev = updates.length ? updates[updates.length - 1].payload : null;
    const prevKey = prev
      ? JSON.stringify({
          situation: prev.situation,
          background: prev.background,
          assessment: prev.assessment,
          recommendation: prev.recommendation,
        })
      : null;
    if (prevKey === JSON.stringify(next)) return;

    await insertAndRoute(ctx, {
      type: "sbar_update",
      source: "agent",
      payload: next,
    });
  },
});
