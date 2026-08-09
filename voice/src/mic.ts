// Mic capture → 16kHz mono s16le PCM chunks. Prefers sox (`rec`) if installed,
// else ffmpeg avfoundation (present on this machine). Auto-retries device
// ":default" → ":0" once, then restarts with backoff. `ducked` drops chunks
// while MediBot itself is speaking (half-duplex echo suppression).

import { spawn, execFileSync, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { cfg } from "./config.js";

function onPath(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export class Mic {
  ducked = false;
  private proc: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private stopped = false;
  private device = cfg.micDevice;
  private triedFallbackDevice = false;
  private backoffMs = 1000;

  constructor(
    private onChunk: (pcm: Buffer) => void,
    private onStatus: (msg: string) => void = (m) => console.log(m),
  ) {}

  start(): void {
    this.stopped = false;
    this.spawnProc();
  }

  stop(): void {
    this.stopped = true;
    this.proc?.kill("SIGTERM");
    this.proc = null;
  }

  private command(): { cmd: string; args: string[] } {
    const backend =
      cfg.micBackend === "auto" ? (onPath("rec") ? "sox" : "ffmpeg") : cfg.micBackend;
    if (backend === "sox") {
      return {
        cmd: "rec",
        args: ["-q", "-r", "16000", "-c", "1", "-b", "16", "-e", "signed-integer", "-t", "raw", "-"],
      };
    }
    return {
      cmd: "ffmpeg",
      args: [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "avfoundation",
        "-i",
        `:${this.device}`,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "s16le",
        "-",
      ],
    };
  }

  private spawnProc(): void {
    const { cmd, args } = this.command();
    const startedAt = Date.now();
    let stderrTail = "";
    this.onStatus(`[voice] mic: ${cmd} (device :${this.device}) — first run triggers the macOS mic permission prompt`);

    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    this.proc = proc;
    proc.stdout.on("data", (b: Buffer) => {
      if (!this.ducked) this.onChunk(b);
    });
    proc.stderr.on("data", (b: Buffer) => {
      stderrTail = (stderrTail + b.toString()).slice(-400);
    });
    proc.on("error", (err) => {
      this.onStatus(`[voice] mic: failed to start ${cmd}: ${err.message}`);
    });
    proc.on("exit", (code) => {
      if (this.stopped || this.proc !== proc) return;
      this.proc = null;
      const quickDeath = Date.now() - startedAt < 1500;
      if (quickDeath && cmd === "ffmpeg" && !this.triedFallbackDevice) {
        this.triedFallbackDevice = true;
        this.device = "0";
        this.onStatus(`[voice] mic: device :${cfg.micDevice} failed, retrying :0 (list: ffmpeg -f avfoundation -list_devices true -i "")`);
        this.spawnProc();
        return;
      }
      this.onStatus(
        `[voice] mic: ${cmd} exited (${code}) ${stderrTail ? `— ${stderrTail.trim()}` : ""}; restarting in ${this.backoffMs}ms`,
      );
      setTimeout(() => {
        if (!this.stopped) this.spawnProc();
      }, this.backoffMs).unref?.();
      this.backoffMs = Math.min(this.backoffMs * 2, 5000);
    });
  }
}
