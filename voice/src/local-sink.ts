// Dev-mode sink used until lane B's Convex deployment exists (no CONVEX_URL).
// Appends JSONL to voice/.data/events.log and tail-watches the same file for
// flag/timer events, so `npm run insert:flag` in a second terminal still
// triggers the spoken alert path (A4) with zero infrastructure.

import { mkdirSync, existsSync, statSync } from "node:fs";
import { open, appendFile } from "node:fs/promises";
import path from "node:path";
import type { MediBotEvent } from "./contract.js";
import type { AlertLike, EventSink } from "./sink.js";

export class LocalSink implements EventSink {
  label: string;

  constructor(private file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.label = `local JSONL ${file} (set CONVEX_URL in voice/.env to go live)`;
  }

  async append(e: MediBotEvent): Promise<void> {
    await appendFile(this.file, JSON.stringify(e) + "\n", "utf8");
  }

  watchAlerts(cb: (e: AlertLike) => void): () => void {
    let pos = existsSync(this.file) ? statSync(this.file).size : 0;
    let remainder = "";
    let live = true;

    const tick = async (): Promise<void> => {
      if (!live) return;
      try {
        const size = existsSync(this.file) ? statSync(this.file).size : 0;
        if (size < pos) {
          pos = size; // file truncated/rotated
          remainder = "";
        } else if (size > pos) {
          const fh = await open(this.file, "r");
          try {
            const buf = Buffer.alloc(size - pos);
            await fh.read(buf, 0, buf.length, pos);
            pos = size;
            remainder += buf.toString("utf8");
          } finally {
            await fh.close();
          }
          const lines = remainder.split("\n");
          remainder = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const e = JSON.parse(line) as AlertLike;
              if (e.type === "flag" || e.type === "timer") cb(e);
            } catch {
              // partial/garbled line — skip
            }
          }
        }
      } catch {
        // transient fs error — retry next tick
      }
      if (live) setTimeout(tick, 300).unref?.();
    };
    void tick();

    return () => {
      live = false;
    };
  }

  close(): void {}
}
