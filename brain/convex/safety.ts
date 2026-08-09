import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { insertAndRoute } from "./events";

// ---------------------------------------------------------------------------
// B3 Safety agent
//
// Deterministic drug-safety check. Fires whenever a medication or intervention
// event lands (routed here by ./events). No LLM, no network — pure lookup so the
// demo's hero beat (aspirin given after the patient states warfarin) always
// fires a flag the voice lane can speak.
// ---------------------------------------------------------------------------

// Known interacting drug groups. Substrings are matched case-insensitively, so
// both generic and brand names are covered.
const ANTICOAG = [
  "warfarin",
  "coumadin",
  "heparin",
  "enoxaparin",
  "lovenox",
  "apixaban",
  "eliquis",
  "rivaroxaban",
  "xarelto",
  "dabigatran",
  "pradaxa",
];

const ANTIPLATELET_NSAID = [
  "aspirin",
  "asa",
  "clopidogrel",
  "plavix",
  "ibuprofen",
  "motrin",
  "naproxen",
  "ketorolac",
  "toradol",
  "nsaid",
];

// True if `name` contains any drug in `group` (substring, case-insensitive —
// caller passes an already-lowercased name).
function inGroup(name: string, group: string[]): boolean {
  return group.some((g) => name.includes(g));
}

export const run = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx: any, args: any) => {
    // 1. Only react to newly-documented drugs/interventions.
    const ev: any = await ctx.db.get(args.eventId);
    if (!ev) return;
    if (ev.type !== "medication" && ev.type !== "intervention") return;

    // 2. Derive the triggering drug/intervention name and the documented state.
    const given: string = (ev.payload?.name ?? ev.payload?.text ?? "")
      .toString()
      .toLowerCase()
      .trim();
    if (!given) return;

    const all: any[] = await ctx.db
      .query("events")
      .withIndex("by_ts")
      .order("asc")
      .collect();

    // Every documented medication (home meds stated by the patient + meds given).
    const documentedMeds: { id: any; name: string; role?: string }[] = [];
    // Every documented allergy (symptom events carrying a truthy payload.allergy).
    const documentedAllergies: { id: any; allergen: string }[] = [];

    for (const e of all) {
      if (e.type === "medication") {
        const name = (e.payload?.name ?? e.payload?.text ?? "")
          .toString()
          .toLowerCase()
          .trim();
        if (name) documentedMeds.push({ id: e._id, name, role: e.role });
      } else if (e.type === "symptom" && e.payload?.allergy) {
        const allergen = e.payload.allergy.toString().toLowerCase().trim();
        if (allergen) documentedAllergies.push({ id: e._id, allergen });
      }
    }

    // Pre-scan existing safety flags so we never emit a duplicate.
    const existingFlags = all.filter(
      (e: any) => e.type === "flag" && e.payload?.kind === "safety",
    );
    const alreadyFlagged = (conflictsWith: string): boolean =>
      existingFlags.some(
        (f: any) =>
          f.payload?.given === given &&
          f.payload?.conflictsWith === conflictsWith,
      );

    // Collect conflicts as { conflictsWith, reason, refId } then emit + dedupe.
    const conflicts: { conflictsWith: string; reason: string; refId: any }[] =
      [];

    // 3a. BLEEDING RISK — triggering drug in one group, another documented med
    // in the opposing group.
    const givenIsAnticoag = inGroup(given, ANTICOAG);
    const givenIsAntiplatelet = inGroup(given, ANTIPLATELET_NSAID);
    if (givenIsAnticoag || givenIsAntiplatelet) {
      const opposing = givenIsAnticoag ? ANTIPLATELET_NSAID : ANTICOAG;
      for (const med of documentedMeds) {
        // Skip the triggering event itself.
        if (med.id === args.eventId) continue;
        if (inGroup(med.name, opposing)) {
          conflicts.push({
            conflictsWith: med.name,
            reason: `Warning: ${given} with documented ${med.name} — bleeding risk.`,
            refId: med.id,
          });
        }
      }
    }

    // 3b. ALLERGY — triggering drug matches a documented allergy (substring,
    // either direction).
    for (const a of documentedAllergies) {
      if (given.includes(a.allergen) || a.allergen.includes(given)) {
        conflicts.push({
          conflictsWith: a.allergen,
          reason: `Warning: ${given} — documented allergy (${a.allergen}).`,
          refId: a.id,
        });
      }
    }

    // 4. Emit one flag per conflict, deduped and routed through the shared path.
    for (const c of conflicts) {
      if (alreadyFlagged(c.conflictsWith)) continue;
      await insertAndRoute(ctx, {
        type: "flag",
        source: "agent",
        payload: {
          kind: "safety",
          severity: "high",
          reason: c.reason,
          given,
          conflictsWith: c.conflictsWith,
        },
        refs: [args.eventId, c.refId],
      });
    }
    // 5. No conflicts → nothing emitted.
  },
});
