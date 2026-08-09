// Voice-activated push-to-talk for VoiceOS. VoiceOS's agent mode only engages
// while its PTT chord (Option+Control) is held — there is no hands-free agent
// mode — so ears watches the live transcript chunks for "Hey VoiceOS" and holds
// the chord programmatically. The hold is ONE atomic osascript (down → delay →
// up): if this process dies mid-hold, the keys still release.
//
// Demo flow: "Hey VoiceOS." … [VoiceOS pill appears] … "Correction — BP 90 over 60."
// Requires Accessibility permission for the terminal (verified in setup).

import { spawn } from "node:child_process";
import { cfg } from "./config.js";

export const VOICEOS_TRIGGER = /voice\s*-?\s*os\b|voiceos/i;

export class VoiceOSPtt {
  private buf = "";
  private lastTrigger = 0;

  constructor(
    private holdMs = cfg.voiceosPttHoldMs,
    private onStatus: (msg: string) => void = (m) => console.log(m),
    /** Injectable for tests; defaults to the real osascript chord hold. */
    private runHold: (holdMs: number, onDone: (err?: string) => void) => void = osascriptHold,
  ) {}

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
      `[voice] "Hey VoiceOS" heard — holding PTT chord ${(this.holdMs / 1000).toFixed(1)}s, speak the command now`,
    );
    this.runHold(this.holdMs, (err) => {
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
