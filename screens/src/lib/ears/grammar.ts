// Synced from voice/src/grammar.ts (lane A's ASR-hardened command grammar,
// verified live: 12/12 command recognitions across mangled wake words).
// Browser adaptation: wake words are "Scribe" AND "MedCrew" (both exact-token,
// real dictionary-ish words), plus the legacy fuzzy "MediBot" net.
//   "correction — BP 90 over 60"      -> correction
//   "Scribe/MedCrew, mark epi given"  -> mark
//   "Scribe/MedCrew, <question>"      -> question (answered from patientState)
// Fused scene+command segments split via extractEmbedded.

export type Command =
  | { kind: "correction"; text: string }
  | { kind: "mark"; text: string }
  | { kind: "question"; text: string }
  | { kind: "wake"; text: "" }

const WAKE_NAMES = ["scribe", "medcrew"]
const FILLER = /^(?:hey|ok(?:ay)?|so|uh+|um+|ah+)[\s,.!]+/i
const CORRECTION = /^(?:ok(?:ay)?[\s,.]+)?correction\b[\s,.:—–-]*(.*)$/i
const QUESTION_START = /^(?:when|what|whats|how|where|why|who|did|does|is|was|are|can|could)\b/i
const BARE_QUERY = [
  /^when(?:'s| was| is)?\s+(?:the\s+)?last\b/i,
  /^what(?:'s| is| was)?\s+the\s+(?:last|latest|current)\b/i,
  /^how\s+long\s+(?:since|ago|has\s+it\s+been)\b/i,
  /^how\s+many\s+(?:rounds|doses|epis?|shocks)\b/i,
]
const GIVENISH =
  /\b(?:given|administered|pushed|started|stopped|placed|delivered|on\s+board|completed?)\b/i

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, "")

function skeleton(word: string): string {
  const w = norm(word)
  if (!w) return ""
  let out = w[0]
  for (let i = 1; i < w.length; i++) {
    const c = w[i]
    if ("aeiou".includes(c)) continue
    if (out[out.length - 1] !== c) out += c
  }
  return out
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
  return dp[a.length][b.length]
}

const WAKE_PREFIX = /^(?:medi|meta|metta|maddi?e?y?|mady|mary|betty|buddy|med)b[oau]/
const WAKE_SKELETONS = ["mdbt", "mtbt"]

function isWakeWord(w: string): boolean {
  const n = norm(w)
  for (const name of WAKE_NAMES) {
    if (n.startsWith(name) && n.length <= name.length + 2) return true
  }
  if (n.length < 4 || n.length > 12) return false
  if (WAKE_PREFIX.test(n)) return true
  const sk = skeleton(n)
  if (WAKE_SKELETONS.some((ref) => editDistance(sk, ref) <= 1)) return true
  return n.startsWith("m") && n.includes("b") && WAKE_SKELETONS.some((ref) => editDistance(sk, ref) <= 2)
}

function wakeTokens(tokens: string[]): number {
  if (tokens.length === 0) return 0
  if (isWakeWord(tokens[0])) return 1
  if (tokens.length >= 2) {
    const joined = norm(tokens[0] + tokens[1])
    if (joined.length <= 10 && isWakeWord(joined)) return 2
  }
  return 0
}

function isMarkVerb(w: string): boolean {
  const n = norm(w)
  return n === "mark" || n === "marked" || editDistance(skeleton(n), "mrk") <= 1
}

const cleanTail = (s: string): string =>
  s.trim().replace(/^[\s,.:—–-]+/, "").replace(/[.!]+$/, "").trim()

function stripFillers(s: string): string {
  let out = s.trim()
  for (let i = 0; i < 2; i++) {
    const m = FILLER.exec(out)
    if (!m) break
    out = out.slice(m[0].length)
  }
  return out
}

const tokenize = (s: string): string[] => s.split(/[\s\-–—]+/).filter(Boolean)

/** MB1's "Hey VoiceOS" PTT trigger family — plumbing, never chart material. */
export function isPlumbingPhrase(text: string): boolean {
  return /^(?:hey[\s,]+|ok(?:ay)?[\s,]+)?(?:voice|boys?|vice|voi)[\s,]*-?\s*(?:os|us)[.!?\s]*$/i.test(
    text.trim(),
  )
}

function afterWake(rest: string): Command | null {
  const text = cleanTail(stripFillers(rest))
  if (!text) return { kind: "wake", text: "" }
  const corr = CORRECTION.exec(text)
  if (corr) {
    const t = cleanTail(corr[1])
    return t ? { kind: "correction", text: t } : { kind: "wake", text: "" }
  }
  const tokens = tokenize(text)
  if (isMarkVerb(tokens[0])) {
    const t = cleanTail(tokens.slice(1).join(" "))
    return t ? { kind: "mark", text: t } : { kind: "wake", text: "" }
  }
  if (QUESTION_START.test(text) || /\?\s*$/.test(text)) return { kind: "question", text }
  if (GIVENISH.test(text)) return { kind: "mark", text }
  return { kind: "question", text }
}

export function parseCommand(raw: string, opts: { assumeWake?: boolean } = {}): Command | null {
  const text = stripFillers(raw)
  if (!text) return null
  if (opts.assumeWake) return afterWake(text)

  const corr = CORRECTION.exec(text)
  if (corr) {
    const t = cleanTail(corr[1])
    return t ? { kind: "correction", text: t } : null
  }

  const tokens = tokenize(text)
  const consumed = wakeTokens(tokens)
  if (consumed > 0) return afterWake(tokens.slice(consumed).join(" "))

  if (/^mark\b/i.test(text)) {
    const t = cleanTail(text.replace(/^mark\b/i, ""))
    if (t) return { kind: "mark", text: t }
  }
  const q = cleanTail(text)
  if (BARE_QUERY.some((re) => re.test(q))) return { kind: "question", text: q }

  for (let i = 1; i <= 3 && i < tokens.length; i++) {
    if (isMarkVerb(tokens[i])) {
      const t = cleanTail(tokens.slice(i + 1).join(" "))
      if (t && GIVENISH.test(t)) return { kind: "mark", text: t }
      break
    }
  }
  return null
}

function strictAccept(cmd: Command | null): cmd is Command {
  if (!cmd) return false
  if (cmd.kind === "correction" || cmd.kind === "mark") return true
  return cmd.kind === "question" && QUESTION_START.test(cmd.text)
}

/** Split ASR-fused "scene speech. Command." segments (observed live on MB1). */
export function extractEmbedded(raw: string): { head: string; cmd: Command; tail: string } | null {
  const tokens = raw.trim().split(/\s+/)
  for (let i = tokens.length - 1; i >= 1; i--) {
    const n = norm(tokens[i])
    if (n !== "correction" && !isWakeWord(tokens[i])) continue
    const tail = tokens.slice(i).join(" ")
    const cmd = parseCommand(tail)
    if (cmd && cmd.kind !== "wake" && strictAccept(cmd)) {
      const head = tokens.slice(0, i).join(" ").replace(/[,;:]+$/, "").trim()
      if (head.length >= 2) return { head, cmd, tail }
    }
  }
  return null
}
