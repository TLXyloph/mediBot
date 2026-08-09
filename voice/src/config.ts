import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const VOICE_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Minimal .env loader (voice/.env, gitignored). Values never logged.
function loadDotEnv(file: string): void {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadDotEnv(path.join(VOICE_DIR, ".env"));

function num(v: string | undefined, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

function uniq(xs: string[]): string[] {
  return Array.from(new Set(xs.filter(Boolean)));
}

const env = process.env;

export const cfg = {
  geminiApiKey: env.GEMINI_API_KEY ?? "",
  convexUrl: env.CONVEX_URL ?? "",
  // Ears (ambient ASR) model try-list: handoff-locked primary, then known-good fallbacks.
  earsModels: uniq([
    env.EARS_MODEL ?? "",
    "gemini-3.1-flash-live-preview",
    "gemini-live-2.5-flash-preview",
    "gemini-2.5-flash-native-audio-preview-09-2025",
  ]),
  ttsEngine: (env.TTS_ENGINE === "say" ? "say" : "gemini") as "gemini" | "say",
  ttsModels: uniq([env.TTS_MODEL ?? "", "gemini-2.5-flash-preview-tts"]),
  ttsVoice: env.TTS_VOICE ?? "Kore",
  sayVoice: env.SAY_VOICE ?? "",
  ttsTimeoutMs: num(env.TTS_TIMEOUT_MS, 2000),
  micBackend: (env.MIC_BACKEND ?? "auto") as "auto" | "ffmpeg" | "sox",
  micDevice: env.MIC_DEVICE ?? "default",
  cmdPort: num(env.CMD_PORT, 4750),
  idleFlushMs: num(env.IDLE_FLUSH_MS, 1200),
  eventsLog: path.join(VOICE_DIR, ".data", "events.log"),
};

// Contract assumption shared with lane B (brain/): Convex module convex/events.ts
// exporting `append` (mutation) and `timeline` (query). Fix here if B names differ.
export const CONVEX_FNS = { module: "events", append: "append", timeline: "timeline" } as const;
