// A3 command grammar over transcribed speech (and VoiceOS-forwarded commands).
//   "correction — BP 90 over 60"        -> correction event
//   "MediBot, mark epi given"           -> intervention event (time-mark)
//   "MediBot, when was the last epi?"   -> question (utterance event with payload.question; eyes/ answers)
// Anything else -> plain utterance (lane B's scribe attributes + extracts).

import { makeEvent, type MediBotEvent } from "./contract.js";

export type Command =
  | { kind: "correction"; text: string }
  | { kind: "mark"; text: string }
  | { kind: "question"; text: string };

// Tolerant of ASR spellings: "MediBot", "Medibot", "medi bot", "med bot", "meta bot".
const WAKE = /^(?:hey\s+|ok(?:ay)?\s+)?(?:medi|med|meta)[\s-]?bot\b[\s,.:!?—–-]*/i;
const CORRECTION = /^(?:ok(?:ay)?[\s,.]+)?correction\b[\s,.:—–-]*(.*)$/i;
const MARK = /^mark\b[\s,.:—–-]*(.*)$/i;

function cleanTail(s: string): string {
  return s.trim().replace(/[.!]+$/, "").trim();
}

export function parseCommand(raw: string): Command | null {
  const text = raw.trim();

  const corr = CORRECTION.exec(text);
  if (corr) {
    const t = cleanTail(corr[1]);
    return t ? { kind: "correction", text: t } : null;
  }

  const wake = WAKE.exec(text);
  if (!wake) return null;
  const rest = text.slice(wake[0].length).trim();
  if (!rest) return null;

  const mark = MARK.exec(rest);
  if (mark) {
    const t = cleanTail(mark[1]);
    return t ? { kind: "mark", text: t } : null;
  }

  return { kind: "question", text: rest };
}

export function commandToEvents(cmd: Command, raw: string): MediBotEvent[] {
  switch (cmd.kind) {
    case "correction":
      // refs stays [] here: linking to the corrected event needs understanding
      // of the log, which is lane B's scribe (R8 audit trail happens there).
      return [makeEvent("correction", { text: cmd.text, raw }, { role: "medic" })];
    case "mark":
      return [makeEvent("intervention", { text: cmd.text, mark: true, raw }, { role: "medic" })];
    case "question":
      return [makeEvent("utterance", { text: raw, question: cmd.text }, { role: "medic" })];
  }
}
