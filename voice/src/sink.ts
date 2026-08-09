import type { MediBotEvent } from "./contract.js";
import { cfg } from "./config.js";
import { LocalSink } from "./local-sink.js";
import { ConvexSink } from "./convex-sink.js";

/** Loose shape for events read back from the log (Convex adds _id/_creationTime). */
export interface AlertLike {
  type?: string;
  ts?: number;
  payload?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface EventSink {
  label: string;
  append(e: MediBotEvent): Promise<void>;
  /** Watch flag+timer events appended from now on. Returns unsubscribe. */
  watchAlerts(cb: (e: AlertLike) => void): () => void;
  close(): void;
}

export function makeSink(): EventSink {
  return cfg.convexUrl ? new ConvexSink(cfg.convexUrl) : new LocalSink(cfg.eventsLog);
}
