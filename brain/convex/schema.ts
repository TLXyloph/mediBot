import { defineSchema, defineTable } from "convex/server";
import { eventColumns } from "./lib/validators";

// One append-only table. ePCR, SBAR, patient state, and both dashboards are all
// derived views over this log. Nobody mutates or deletes events; corrections are
// new `correction` events that reference the corrected one via `refs`.
export default defineSchema({
  events: defineTable(eventColumns)
    .index("by_ts", ["ts"])
    .index("by_type", ["type"]),
});
