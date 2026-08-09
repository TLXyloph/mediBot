// Voice-activated push-to-talk for VoiceOS. VoiceOS's agent mode only engages
// while its PTT chord (Option+Control) is held — there is no hands-free agent
// mode — so ears watches the live transcript chunks for "Hey VoiceOS" and holds
// the chord programmatically. The hold is ONE atomic osascript (down → delay →
// up): if this process dies mid-hold, the keys still release.
//
// Demo flow: "Hey VoiceOS." … [VoiceOS pill appears] … "Correction — BP 90 over 60."
// Requires Accessibility permission for the terminal (verified in setup).

import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { cfg, VOICE_DIR } from "./config.js";

// Exact "voice os" anywhere, or hey-anchored fuzzy manglings observed live
// ("Hey, voice us", "Hey, boys OS"). Hey-anchoring keeps ambient speech from
// false-firing a 6s chord hold (VoiceOS has native actions enabled).
export const VOICEOS_TRIGGER =
  /voice\s*-?\s*os\b|voiceos|(?:hey|ok(?:ay)?)[,.!\s]+(?:voice|boys?|vice|voi)[,.\s]*-?\s*(?:os|us)\b/i;

const HELPER_SRC = path.join(VOICE_DIR, "scripts", "hold-ptt.swift");
const HELPER_BIN = path.join(VOICE_DIR, ".data", "hold-ptt");

export class VoiceOSPtt {
  private buf = "";
  private lastTrigger = 0;
  private mechanism: "hid" | "osascript" = "osascript";

  constructor(
    private holdMs = cfg.voiceosPttHoldMs,
    private onStatus: (msg: string) => void = (m) => console.log(m),
    /** Injectable for tests; defaults to the real chord hold. */
    private runHold?: (holdMs: number, onDone: (err?: string) => void) => void,
  ) {}

  /** Compile the HID helper once (VoiceOS ignores session-level synthetics). */
  async prepare(): Promise<void> {
    if (!cfg.voiceosPttEnabled || this.runHold) return;
    if (existsSync(HELPER_BIN)) {
      this.mechanism = "hid";
      return;
    }
    try {
      mkdirSync(path.dirname(HELPER_BIN), { recursive: true });
      await new Promise<void>((resolve, reject) => {
        execFile("swiftc", ["-O", HELPER_SRC, "-o", HELPER_BIN], (err, _o, stderr) =>
          err ? reject(new Error(String(stderr || err.message).slice(0, 200))) : resolve(),
        );
      });
      this.mechanism = "hid";
      this.onStatus("[voice] PTT: compiled HID key helper (hardware-level chord)");
    } catch (err) {
      this.mechanism = "osascript";
      this.onStatus(
        `[voice] PTT: swift helper unavailable (${String(err).slice(0, 100)}) — osascript fallback`,
      );
    }
  }

  /** Feed raw transcript chunks (pre-segmentation — latency matters here). */
  observeChunk(text: string): void {
    if (!cfg.voiceosPttEnabled) return;
    this.buf = `${this.buf} ${text}`.slice(-120);
    if (!VOICEOS_TRIGGER.test(this.buf)) return;
    const now = Date.now();
    if (now - this.lastTrigger < this.holdMs + 2500) return; // debounce
    this.lastTrigger = now;
    this.buf = "";
    this.onStatus(
      `[voice] "Hey VoiceOS" heard — holding PTT chord ${(this.holdMs / 1000).toFixed(1)}s [${this.mechanism}], speak the command now`,
    );
    const run = this.runHold ?? (this.mechanism === "hid" ? hidHold : osascriptHold);
    run(this.holdMs, (err) => {
      if (err) {
        this.onStatus(
          `[voice] PTT hold failed (${err.slice(0, 120)}) — check System Settings → Privacy & Security → Accessibility for your terminal`,
        );
      } else {
        this.onStatus("[voice] PTT chord released");
      }
    });
  }
}

function hidHold(holdMs: number, onDone: (err?: string) => void): void {
  const p = spawn(HELPER_BIN, [String(holdMs)], { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", (b: Buffer) => (err += b.toString()));
  p.on("error", (e) => onDone(e.message));
  p.on("exit", (code) => onDone(code === 0 ? undefined : err.trim() || `hold-ptt exit ${code}`));
}

function osascriptHold(holdMs: number, onDone: (err?: string) => void): void {
  const script = `tell application "System Events"
key down option
key down control
delay ${(holdMs / 1000).toFixed(2)}
key up control
key up option
end tell`;
  const p = spawn("osascript", ["-e", script], { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", (b: Buffer) => (err += b.toString()));
  p.on("error", (e) => onDone(e.message));
  p.on("exit", (code) => onDone(code === 0 ? undefined : err.trim() || `osascript exit ${code}`));
}
