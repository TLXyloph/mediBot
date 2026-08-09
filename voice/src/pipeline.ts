// Every utterance — from the ears session, VoiceOS MCP tools, or fake mode —
// funnels through here: command grammar first, else plain utterance event.
// Stateful: a wake-word-only utterance ("MediBot." … pause) arms a short window
// so the NEXT utterance is parsed as if it were wake-prefixed (hesitation
// recovery for ASR splitting commands across segments).

import { makeEvent, type MediBotEvent } from "./contract.js";
import { parseCommand, commandToEvents, type Command } from "./grammar.js";
import type { EventSink } from "./sink.js";

const WAKE_HANGOVER_MS = 4000;

export interface UtteranceOpts {
  speaker?: string;
  /** Pre-classified by VoiceOS's agent (MCP tool call) — skips the grammar. */
  kind?: "correction" | "mark" | "question";
}

export type Pipeline = (text: string, opts?: UtteranceOpts) => MediBotEvent[];

export function createPipeline(sink: EventSink): Pipeline {
  let pendingWakeUntil = 0;

  return function handleUtterance(text: string, opts: UtteranceOpts = {}): MediBotEvent[] {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return [];

    let cmd: Command | null;
    if (opts.kind) {
      cmd = { kind: opts.kind, text: trimmed };
    } else {
      const assumeWake = Date.now() < pendingWakeUntil;
      pendingWakeUntil = 0;
      cmd = parseCommand(trimmed, { assumeWake });
    }

    if (cmd?.kind === "wake") {
      pendingWakeUntil = Date.now() + WAKE_HANGOVER_MS;
      console.log(`[voice] wake word heard — holding for next utterance ← "${trimmed.slice(0, 60)}"`);
      return [];
    }

    const events = cmd
      ? commandToEvents(cmd, trimmed)
      : [makeEvent("utterance", { text: trimmed, ...(opts.speaker ? { speaker: opts.speaker } : {}) })];

    for (const e of events) {
      void sink.append(e).catch((err) => {
        console.error(`[voice] append failed (${e.type}): ${String(err).slice(0, 200)}`);
      });
      console.log(
        `[voice] ${cmd ? `command:${cmd.kind}` : "utterance"} → ${e.type} ← "${trimmed.slice(0, 80)}"`,
      );
    }
    return events;
  };
}
