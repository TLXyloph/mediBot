// MediBot Lane A entrypoint.
//   npm run dev    — live: mic → ears (Gemini Live ASR) → events; alerts → TTS
//   npm run fake   — no mic/key needed: type or pipe transcript lines on stdin
// Always runs: sink (Convex or local JSONL), alert watcher → TTS, command server.

import readline from "node:readline";
import { cfg } from "./config.js";
import { makeSink, type AlertLike } from "./sink.js";
import { Speaker } from "./tts.js";
import { TranscriptSegmenter } from "./segmenter.js";
import { Ears } from "./ears.js";
import { Mic } from "./mic.js";
import { createPipeline } from "./pipeline.js";
import { startCommandServer } from "./command-server.js";

const fake = process.argv.includes("--fake");

const sink = makeSink();
const speaker = new Speaker();

function alertText(e: AlertLike): string {
  const p = e.payload ?? {};
  for (const k of ["say", "text", "message", "label"]) {
    if (typeof p[k] === "string" && (p[k] as string).trim()) return p[k] as string;
  }
  return e.type === "timer" ? "Protocol timer due." : "Safety flag raised.";
}

console.log("[voice] MediBot Lane A — voice I/O");
console.log(`[voice] sink: ${sink.label}`);
const recentAlerts = new Map<string, number>();
const unwatch = sink.watchAlerts((e) => {
  const text = alertText(e);
  // Duplicate-storm guard: the safety agent has been observed emitting the
  // same flag 4×; speak identical alert text at most once per 8s.
  const last = recentAlerts.get(text) ?? 0;
  if (Date.now() - last < 8000) {
    console.log(`[voice] ALERT ${e.type}: duplicate suppressed ("${text.slice(0, 50)}")`);
    return;
  }
  recentAlerts.set(text, Date.now());
  console.log(`[voice] ALERT ${e.type}: speaking "${text}"`);
  speaker.say(text);
});
console.log(`[voice] alerts: flag+timer → TTS (${cfg.ttsEngine === "say" ? "macOS say" : "instant say, Gemini voice cached for repeats"})`);
speaker.prewarm(["Protocol timer due.", "Safety flag raised."]);

const pipeline = createPipeline(sink);

// Ears duck when MediBot's own TTS speaks AND for a window after each
// VoiceOS-routed command (its agent voice replies aloud — without this, ears
// transcribes the reply into the chart as an utterance).
let externalDuckUntil = 0;
function applyDuck(): void {
  if (mic) mic.ducked = speaker.speaking || Date.now() < externalDuckUntil;
}
function duckForVoiceOSReply(): void {
  externalDuckUntil = Date.now() + 7000;
  applyDuck();
  ears?.notifyDucked();
  setTimeout(applyDuck, 7100).unref?.();
}

const server = startCommandServer(pipeline, sink, speaker, duckForVoiceOSReply);

let ears: Ears | null = null;
let mic: Mic | null = null;

if (fake) {
  console.log('[voice] FAKE MODE — type transcript lines (e.g. "correction BP 90 over 60"), Ctrl-D to end');
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (line.trim()) pipeline(line);
  });
  rl.on("close", () => {
    // let sink appends settle, then exit (piped-input smoke runs rely on this)
    setTimeout(() => shutdown(0), 600);
  });
} else if (!cfg.geminiApiKey) {
  console.error(
    "[voice] GEMINI_API_KEY missing (voice/.env) — ears disabled. Command server, alerts and TTS still run; use `npm run fake` for keyless testing.",
  );
} else {
  const segmenter = new TranscriptSegmenter((text, meta) => {
    pipeline(text, { speaker: meta.speaker });
  }, cfg.idleFlushMs);

  ears = new Ears(
    (chunk, meta) => segmenter.push(chunk, meta),
    () => segmenter.boundary(),
  );
  mic = new Mic((pcm) => ears?.sendAudio(pcm));

  speaker.onSpeakingChange = (speaking) => {
    applyDuck(); // half-duplex: never transcribe our own TTS
    if (speaking) ears?.notifyDucked();
  };

  void ears.start();
  mic.start();
}

function shutdown(code: number): void {
  unwatch();
  mic?.stop();
  ears?.stop();
  server.close();
  sink.close();
  setTimeout(() => process.exit(code), 200);
}

process.on("SIGINT", () => {
  console.log("\n[voice] shutting down");
  shutdown(0);
});
process.on("SIGTERM", () => shutdown(0));
