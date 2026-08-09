// Every utterance — from the ears session, VoiceOS MCP tools, or fake mode —
// funnels through here: command grammar first, else plain utterance event.

import { makeEvent, type MediBotEvent } from "./contract.js";
import { parseCommand, commandToEvents, type Command } from "./grammar.js";
import type { EventSink } from "./sink.js";

export interface UtteranceOpts {
  speaker?: string;
  /** Pre-classified by VoiceOS's agent (MCP tool call) — skips the grammar. */
  kind?: Command["kind"];
}

export function handleUtterance(
  text: string,
  sink: EventSink,
  opts: UtteranceOpts = {},
): MediBotEvent[] {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];

  const cmd: Command | null = opts.kind
    ? { kind: opts.kind, text: trimmed }
    : parseCommand(trimmed);

  const events = cmd
    ? commandToEvents(cmd, trimmed)
    : [makeEvent("utterance", { text: trimmed, ...(opts.speaker ? { speaker: opts.speaker } : {}) })];

  for (const e of events) {
    void sink.append(e).catch((err) => {
      console.error(`[voice] append failed (${e.type}): ${String(err).slice(0, 200)}`);
    });
    console.log(`[voice] ${cmd ? `command:${cmd.kind}` : "utterance"} → ${e.type} ← "${trimmed.slice(0, 80)}"`);
  }
  return events;
}
