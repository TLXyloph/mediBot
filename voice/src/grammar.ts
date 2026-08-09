// A3 command grammar over transcribed speech (and VoiceOS-forwarded commands).
// Hardened against real-world ASR of the OOV wake word "MediBot", observed live:
// "Metabott", "metabolomic", "Maddie Bart", dropped entirely. Strategy:
//   1. fuzzy phonetic wake-word match (variant prefixes + consonant skeleton)
//   2. wake-optional commands: leading "mark …", patient-state question templates
//   3. wake-only utterances ("MediBot." then a pause) return kind:"wake" so the
//      pipeline can prepend it to the next utterance (hesitation recovery)
// Misses stay plain utterances — lane B's scribe still extracts them ambiently.

import { makeEvent, type MediBotEvent } from "./contract.js";

export type Command =
  | { kind: "correction"; text: string }
  | { kind: "mark"; text: string }
  | { kind: "question"; text: string }
  | { kind: "wake"; text: "" }; // wake word alone — never evented, pipeline state only

const FILLER = /^(?:hey|ok(?:ay)?|so|uh+|um+|ah+)[\s,.!]+/i;
const CORRECTION = /^(?:ok(?:ay)?[\s,.]+)?correction\b[\s,.:—–-]*(.*)$/i;
const QUESTION_START = /^(?:when|what|whats|how|where|why|who|did|does|is|was|are|can|could)\b/i;
// Bare patient-state questions that are unambiguous MediBot queries even with
// the wake word lost ("When was the last epinephrine?").
const BARE_QUERY = [
  /^when(?:'s| was| is)?\s+(?:the\s+)?last\b/i,
  /^what(?:'s| is| was)?\s+the\s+(?:last|latest|current)\b/i,
  /^how\s+long\s+(?:since|ago|has\s+it\s+been)\b/i,
  /^how\s+many\s+(?:rounds|doses|epis?|shocks)\b/i,
];
// Post-wake statements like "epi given" (the verb "mark" got eaten by ASR).
const GIVENISH = /\b(?:given|administered|pushed|started|stopped|placed|delivered|on\s+board|completed?)\b/i;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "");

// Consonant skeleton: "medibot"->mdbt, "metabott"->mtbt, "maddiebart"->mdbrt.
function skeleton(word: string): string {
  const w = norm(word);
  if (!w) return "";
  let out = w[0];
  for (let i = 1; i < w.length; i++) {
    const c = w[i];
    if ("aeiou".includes(c)) continue;
    if (out[out.length - 1] !== c) out += c;
  }
  return out;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length][b.length];
}

const WAKE_PREFIX = /^(?:medi|meta|metta|maddi?e?y?|mady|mary|betty|buddy|med)b[oau]/;
const WAKE_SKELETONS = ["mdbt", "mtbt"];

function isWakeWord(w: string): boolean {
  const n = norm(w);
  if (n.length < 4 || n.length > 12) return false;
  if (WAKE_PREFIX.test(n)) return true;
  const sk = skeleton(n);
  if (WAKE_SKELETONS.some((ref) => editDistance(sk, ref) <= 1)) return true;
  // Looser net for wilder ASR guesses ("Merbau"): m-initial + contains b.
  return (
    n.startsWith("m") && n.includes("b") && WAKE_SKELETONS.some((ref) => editDistance(sk, ref) <= 2)
  );
}

/** Returns how many leading tokens form a fuzzy "MediBot" (0 = no wake). */
function wakeTokens(tokens: string[]): number {
  if (tokens.length === 0) return 0;
  if (isWakeWord(tokens[0])) return 1;
  if (tokens.length >= 2) {
    const joined = norm(tokens[0] + tokens[1]);
    if (joined.length <= 10 && isWakeWord(joined)) return 2;
  }
  return 0;
}

function isMarkVerb(w: string): boolean {
  const n = norm(w);
  return n === "mark" || n === "marked" || editDistance(skeleton(n), "mrk") <= 1;
}

function cleanTail(s: string): string {
  return s.trim().replace(/^[\s,.:—–-]+/, "").replace(/[.!]+$/, "").trim();
}

function stripFillers(s: string): string {
  let out = s.trim();
  for (let i = 0; i < 2; i++) {
    const m = FILLER.exec(out);
    if (!m) break;
    out = out.slice(m[0].length);
  }
  return out;
}

/** Classify what follows the wake word (real or assumed). */
function afterWake(rest: string): Command | null {
  const text = cleanTail(stripFillers(rest));
  if (!text) return { kind: "wake", text: "" };
  const corr = CORRECTION.exec(text);
  if (corr) {
    const t = cleanTail(corr[1]);
    return t ? { kind: "correction", text: t } : { kind: "wake", text: "" };
  }
  const tokens = text.split(/\s+/);
  if (isMarkVerb(tokens[0])) {
    const t = cleanTail(tokens.slice(1).join(" "));
    return t ? { kind: "mark", text: t } : { kind: "wake", text: "" };
  }
  if (QUESTION_START.test(text) || /\?\s*$/.test(text)) return { kind: "question", text };
  if (GIVENISH.test(text)) return { kind: "mark", text }; // "epi given" — mark verb eaten
  return { kind: "question", text }; // addressed speech defaults to a query
}

export function parseCommand(raw: string, opts: { assumeWake?: boolean } = {}): Command | null {
  const text = stripFillers(raw);
  if (!text) return null;

  if (opts.assumeWake) return afterWake(text);

  const corr = CORRECTION.exec(text);
  if (corr) {
    const t = cleanTail(corr[1]);
    return t ? { kind: "correction", text: t } : null;
  }

  const tokens = text.split(/\s+/);
  const consumed = wakeTokens(tokens);
  if (consumed > 0) return afterWake(tokens.slice(consumed).join(" "));

  // No wake word — conservative bare commands only.
  if (/^mark\b/i.test(text)) {
    const t = cleanTail(text.replace(/^mark\b/i, ""));
    if (t) return { kind: "mark", text: t };
  }
  const q = cleanTail(text);
  if (BARE_QUERY.some((re) => re.test(q))) return { kind: "question", text: q };

  // Last-chance recovery: wake word mangled beyond recognition but "mark" sits
  // in the first few tokens with an administration tail — observed as
  // "Never bought Mark Ecko given." / "That a boy, Mark. Epinephrine given."
  for (let i = 1; i <= 3 && i < tokens.length; i++) {
    if (isMarkVerb(tokens[i])) {
      const t = cleanTail(tokens.slice(i + 1).join(" "));
      if (t && GIVENISH.test(t)) return { kind: "mark", text: t };
      break;
    }
  }
  return null;
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
    case "wake":
      return []; // pipeline state only
  }
}
