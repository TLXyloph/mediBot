// Convex sink: append via HTTP mutation, watch alerts via reactive query
// (WebSocket) with automatic fallback to 500ms polling if the subscription
// errors. All function references are anyApi string names per the handoff's
// decoupling rule — zero shared files with brain/.

import { ConvexHttpClient, ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { MediBotEvent } from "./contract.js";
import type { AlertLike, EventSink } from "./sink.js";
import { CONVEX_FNS } from "./config.js";

const appendRef = anyApi[CONVEX_FNS.module][CONVEX_FNS.append];
const timelineRef = anyApi[CONVEX_FNS.module][CONVEX_FNS.timeline];

function toRows(result: unknown): AlertLike[] {
  if (Array.isArray(result)) return result as AlertLike[];
  const r = result as { events?: AlertLike[]; page?: AlertLike[] } | null;
  return r?.events ?? r?.page ?? [];
}

export class ConvexSink implements EventSink {
  label: string;
  private http: ConvexHttpClient;
  private live: ConvexClient | null = null;

  constructor(private url: string) {
    this.http = new ConvexHttpClient(url);
    this.label = `convex ${url}`;
  }

  async append(e: MediBotEvent): Promise<void> {
    await this.http.mutation(appendRef, e as unknown as Record<string, unknown>);
  }

  watchAlerts(cb: (e: AlertLike) => void): () => void {
    const startTs = Date.now();
    const seen = new Set<string>();
    let unsub: (() => void) | null = null;
    let pollTimer: NodeJS.Timeout | null = null;
    let live = true;
    let warned = false;

    const emit = (result: unknown): void => {
      for (const row of toRows(result)) {
        if (row?.type !== "flag" && row?.type !== "timer") continue;
        const ts = Number(row.ts ?? (row as { _creationTime?: number })._creationTime ?? 0);
        if (ts && ts < startTs) continue; // only alerts appended after we started
        const key = String(
          (row as { _id?: string })._id ?? `${ts}:${row.type}:${JSON.stringify(row.payload)}`,
        );
        if (seen.has(key)) continue;
        seen.add(key);
        cb(row);
      }
    };

    const startPolling = (): void => {
      if (!live || pollTimer) return;
      console.log("[voice] alerts: using 500ms polling fallback");
      const poll = async (): Promise<void> => {
        if (!live) return;
        try {
          emit(await this.http.query(timelineRef, {}));
        } catch (err) {
          if (!warned) {
            warned = true;
            console.error(
              `[voice] alerts: timeline query failing (is brain/'s events:timeline deployed?): ${String(err).slice(0, 200)}`,
            );
          }
        }
        if (live) pollTimer = setTimeout(poll, 500);
        pollTimer?.unref?.();
      };
      void poll();
    };

    try {
      this.live = new ConvexClient(this.url);
      unsub = this.live.onUpdate(timelineRef, {}, emit, (err: Error) => {
        console.error(`[voice] alerts: subscription error, falling back to polling: ${err.message}`);
        try {
          unsub?.();
        } catch {}
        unsub = null;
        startPolling();
      });
      console.log("[voice] alerts: subscribed to events:timeline (reactive)");
    } catch (err) {
      console.error(`[voice] alerts: subscribe failed (${String(err).slice(0, 120)})`);
      startPolling();
    }

    return () => {
      live = false;
      if (pollTimer) clearTimeout(pollTimer);
      try {
        unsub?.();
      } catch {}
    };
  }

  close(): void {
    void this.live?.close();
  }
}
