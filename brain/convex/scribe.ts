"use node"; // @google/genai (via lib/llm) needs the Node runtime

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Type } from "@google/genai";
import { llm, llmConfigured } from "./lib/llm";

// B2 — Scribe agent. Scheduled by events.append on every `utterance`.
// Reads the utterance, extracts role-attributed clinical events, appends them
// as `source: "agent"` events referencing the utterance (provenance for R7),
// then marks the utterance processed (idempotency, so a retry can't double-emit).
export const run = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const ev = await ctx.runQuery(internal.events.getEvent, {
      eventId: args.eventId,
    });
    if (!ev || ev.type !== "utterance" || ev.processed) return;

    const text: string = ev.payload?.text ?? String(ev.payload ?? "");

    // No key wired yet (Phase 0): mark processed so we don't spin/retry, and
    // leave a breadcrumb. B2 goes live the moment GEMINI_API_KEY is set.
    if (!text.trim() || !llmConfigured()) {
      if (!llmConfigured()) {
        console.log("[scribe] LLM not configured — skipping extraction (set GEMINI_API_KEY)");
      }
      await ctx.runMutation(internal.events.markProcessed, { eventId: args.eventId });
      return;
    }

    let extracted: Array<any>;
    try {
      extracted = await extractFromUtterance(text);
    } catch (err) {
      // Do NOT mark processed → a later re-run can retry this utterance.
      console.error("[scribe] extraction failed, leaving unprocessed:", err);
      return;
    }

    for (const item of extracted) {
      if (!item?.type) continue;
      await ctx.runMutation(internal.events.appendInternal, {
        type: item.type,
        source: "agent",
        role: item.role ?? ev.role,
        payload: item.payload ?? {},
        conf: typeof item.conf === "number" ? item.conf : undefined,
        refs: [args.eventId],
      });
    }
    await ctx.runMutation(internal.events.markProcessed, { eventId: args.eventId });
  },
});

const SCRIBE_SYSTEM = `You are the scribe for a paramedic ePCR. Given ONE utterance, extract clinical events.
Return ONLY a JSON object: { "events": [ { "type", "role", "payload", "conf" } ] }.
type is one of: symptom | medication | intervention | vital.
role is one of: medic | patient | partner | bystander — inferred from content (who the line is about / who said it). No acoustic info is available.
payload shapes: medication {name}; symptom {text, allergy?}; vital {name, value}; intervention {name}.
conf is 0..1. Emit {"events": []} if nothing clinical. Never invent facts not present in the utterance.`;

// Structured-output schema: constrains Gemini to valid JSON of this exact shape,
// so we never lose an extraction (e.g. the safety-critical "giving aspirin" beat)
// to a malformed-JSON response.
const SCRIBE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    events: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ["symptom", "medication", "intervention", "vital"],
          },
          role: {
            type: Type.STRING,
            enum: ["medic", "patient", "partner", "bystander"],
          },
          payload: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              text: { type: Type.STRING },
              value: { type: Type.STRING },
              allergy: { type: Type.STRING },
            },
          },
          conf: { type: Type.NUMBER },
        },
        required: ["type", "payload"],
      },
    },
  },
  required: ["events"],
};

async function extractFromUtterance(text: string): Promise<Array<any>> {
  const raw = await llm(
    `Utterance: ${JSON.stringify(text)}`,
    SCRIBE_SYSTEM,
    SCRIBE_SCHEMA,
  );
  // Belt-and-suspenders: strip any stray code fences before parsing. With the
  // schema in place the output is already valid JSON; this just never throws.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  return Array.isArray(parsed?.events) ? parsed.events : [];
}
