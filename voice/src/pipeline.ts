// Every utterance — from the ears session, VoiceOS MCP tools, or fake mode —
// funnels through here: command grammar first, else plain utterance event.
// Stateful: a wake-word-only utterance ("MediBot." … pause) arms a short window
// so the NEXT utterance is parsed as if it were wake-prefixed (hesitation
// recovery for ASR splitting commands across segments).

import { makeEvent, type MediBotEvent } from "./contract.js";
import { parseCommand, commandToEvents, extractEmbedded, type Command } from "./grammar.js";
import type { EventSink } from "./sink.js";

const WAKE_HANGOVER_MS = 4000;
// One spoken command can arrive twice: ears' grammar AND VoiceOS's MCP tool
// (both heard the same speech). Whichever lands second within this window is
// dropped so the chart doesn't get duplicate corrections/marks.
const CROSS_PATH_WINDOW_MS = 12_000;

const fpNorm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();

export interface UtteranceOpts {
  speaker?: string;
  /** Pre-classified by VoiceOS's agent (MCP tool call) — skips the grammar. */
  kind?: "correction" | "mark" | "question";
}

export type Pipeline = (text: string, opts?: UtteranceOpts) => MediBotEvent[];

export function createPipeline(sink: EventSink): Pipeline {
  let pendingWakeUntil = 0;
  const recentCommands = new Map<string, number>();

  return function handleUtterance(text: string, opts: UtteranceOpts = {}): MediBotEvent[] {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return [];

    // The PTT trigger phrase alone is plumbing, not chart material — including
    // its ASR manglings ("Hey, voice us.", "Hey, boys OS"). Full-match only.
    if (/^(?:hey[\s,]+|ok(?:ay)?[\s,]+)?(?:voice|boys?|vice|voi)[\s,]*-?\s*(?:os|us)[.!?\s]*$/i.test(trimmed)) {
      console.log(`[voice] VoiceOS PTT trigger — not evented ← "${trimmed.slice(0, 40)}"`);
      return [];
    }

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

    if (cmd) {
      const fp = `${cmd.kind}|${fpNorm(cmd.text)}`;
      const last = recentCommands.get(fp) ?? 0;
      if (Date.now() - last < CROSS_PATH_WINDOW_MS) {
        console.log(`[voice] command:${cmd.kind} duplicate across ears/VoiceOS — suppressed`);
        return [];
      }
      recentCommands.set(fp, Date.now());
      if (recentCommands.size > 50) {
        for (const [k, t] of recentCommands) {
          if (Date.now() - t > CROSS_PATH_WINDOW_MS) recentCommands.delete(k);
        }
      }
    }

    let events: MediBotEvent[];
    if (cmd) {
      events = commandToEvents(cmd, trimmed);
    } else {
      const embedded = extractEmbedded(trimmed);
      if (embedded) {
        cmd = embedded.cmd;
        console.log(`[voice] split fused segment: scene "…${embedded.head.slice(-40)}" + command`);
        events = [
          makeEvent("utterance", {
            text: embedded.head,
            ...(opts.speaker ? { speaker: opts.speaker } : {}),
          }),
          ...commandToEvents(embedded.cmd, embedded.tail),
        ];
      } else {
        events = [
          makeEvent("utterance", { text: trimmed, ...(opts.speaker ? { speaker: opts.speaker } : {}) }),
        ];
      }
    }

    for (const e of events) {
      void sink.append(e).catch((err) => {
        console.error(`[voice] append failed (${e.type}): ${String(err).slice(0, 200)}`);
      });
      const label = !cmd
        ? "utterance"
        : events.length > 1 && e.type === "utterance" && e.payload.question === undefined
          ? "scene"
          : `command:${cmd.kind}`;
      console.log(`[voice] ${label} → ${e.type} ← "${trimmed.slice(0, 80)}"`);
    }
    return events;
  };
}
