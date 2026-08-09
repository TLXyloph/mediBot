// A4 output channel. Primary: Gemini TTS (wav via afplay). Fallback: macOS `say`
// (zero-dependency, instant). Serialized queue; `speaking` drives ears ducking
// so MediBot never transcribes its own voice. Repeated callouts (timers) are
// served from an in-memory wav cache for sub-second starts.

import { GoogleGenAI, Modality } from "@google/genai";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { cfg } from "./config.js";

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
  });
}

export class Speaker {
  onSpeakingChange?: (speaking: boolean) => void;
  speaking = false;
  private queue: string[] = [];
  private draining = false;
  private ai: GoogleGenAI | null = null;
  private ttsModel: string | null = null;
  private cache = new Map<string, string>(); // text -> wav path
  private warming = new Set<string>();
  private geminiBroken = false;

  constructor() {
    if (cfg.geminiApiKey && cfg.ttsEngine === "gemini") {
      this.ai = new GoogleGenAI({ apiKey: cfg.geminiApiKey });
    }
  }

  say(text: string): void {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) return;
    this.queue.push(t);
    void this.drain();
  }

  /** Resolves when the queue is empty and nothing is being spoken. */
  async idle(): Promise<void> {
    while (this.queue.length > 0 || this.draining) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private setSpeaking(s: boolean): void {
    if (this.speaking !== s) {
      this.speaking = s;
      this.onSpeakingChange?.(s);
    }
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      let text: string | undefined;
      while ((text = this.queue.shift()) !== undefined) {
        this.setSpeaking(true);
        try {
          await this.speakOne(text);
        } catch (err) {
          console.error(`[voice] tts failed entirely: ${String(err).slice(0, 200)}`);
        }
      }
    } finally {
      this.setSpeaking(false);
      this.draining = false;
    }
  }

  /** Warm the premium-voice cache for known callouts (fire-and-forget). */
  prewarm(texts: string[]): void {
    for (const t of texts) this.warm(t.replace(/\s+/g, " ").trim());
  }

  // Alert latency is the contract (R4/R6): never gate speech on a cloud call.
  // Cached premium wav plays instantly; otherwise `say` speaks NOW and the
  // Gemini wav warms in the background so repeats (timers) get the good voice.
  private async speakOne(text: string): Promise<void> {
    const cached = this.cache.get(text);
    if (cached) {
      try {
        await run("afplay", [cached]);
        return;
      } catch {
        this.cache.delete(text); // tmp file gone — fall through to say + rewarm
      }
    }
    this.warm(text);
    await this.macSay(text);
  }

  private warm(text: string): void {
    if (!this.ai || this.geminiBroken || !text || this.cache.has(text) || this.warming.has(text)) return;
    this.warming.add(text);
    void this.geminiWav(text)
      .catch((err) => {
        console.error(`[voice] tts warm failed for "${text.slice(0, 40)}…": ${String(err).slice(0, 120)}`);
      })
      .finally(() => this.warming.delete(text));
  }

  private async geminiWav(text: string): Promise<string> {
    const gen = async (): Promise<string> => {
      let lastErr: unknown = new Error("no tts model");
      for (const model of this.ttsModel ? [this.ttsModel] : cfg.ttsModels) {
        try {
          const resp = await this.ai!.models.generateContent({
            model,
            contents: text,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.ttsVoice } },
              },
            },
          });
          const part = resp.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
          const data = part?.inlineData?.data;
          if (!data) throw new Error("no audio in response");
          const rate = Number(/rate=(\d+)/.exec(part?.inlineData?.mimeType ?? "")?.[1] ?? 24000);
          const wav = pcmToWav(Buffer.from(data, "base64"), rate);
          const file = path.join(
            os.tmpdir(),
            `medibot-tts-${createHash("sha1").update(text).digest("hex").slice(0, 12)}.wav`,
          );
          await writeFile(file, wav);
          this.ttsModel = model;
          this.cache.set(text, file);
          return file;
        } catch (err) {
          lastErr = err;
        }
      }
      this.geminiBroken = true; // every model failed — stop warming this session
      throw lastErr;
    };

    // Generous cap: this only runs in the background warmer, never in the
    // speech path (cfg.ttsTimeoutMs floor keeps env override meaningful).
    const capMs = Math.max(cfg.ttsTimeoutMs, 10_000);
    return await Promise.race([
      gen(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout ${capMs}ms`)), capMs).unref?.(),
      ),
    ]);
  }

  private async macSay(text: string): Promise<void> {
    const safe = text.replace(/^[\s-]+/, "");
    const args = cfg.sayVoice ? ["-v", cfg.sayVoice, safe] : [safe];
    await run("say", args);
  }
}
