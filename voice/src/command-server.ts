// Localhost-only HTTP endpoint. VoiceOS's MediBot integration (MCP tools in
// ../voiceos-integration/) POSTs classified commands here; also handy for
// manual curl tests. Loopback bind + input validation at the boundary.

import http from "node:http";
import { cfg } from "./config.js";
import type { Pipeline } from "./pipeline.js";
import type { EventSink } from "./sink.js";
import type { Speaker } from "./tts.js";

const KINDS = new Set(["correction", "mark", "question"]);
const MAX_TEXT = 2000;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 10_000) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function startCommandServer(
  pipeline: Pipeline,
  sink: EventSink,
  speaker: Speaker,
  /** Called on each VoiceOS-routed command: its agent is about to speak aloud. */
  onExternalCommand?: () => void,
): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        return json(res, 200, { ok: true, sink: sink.label });
      }
      if (req.method === "POST" && (req.url === "/command" || req.url === "/say")) {
        const raw = await readBody(req);
        let text = "";
        let kind: string | undefined;
        try {
          const parsed = JSON.parse(raw) as { text?: unknown; kind?: unknown };
          text = typeof parsed.text === "string" ? parsed.text : "";
          kind = typeof parsed.kind === "string" ? parsed.kind : undefined;
        } catch {
          text = raw; // allow plain-text bodies
        }
        text = text.trim().slice(0, MAX_TEXT);
        if (!text) return json(res, 400, { ok: false, error: "missing text" });

        if (req.url === "/say") {
          speaker.say(text);
          return json(res, 200, { ok: true });
        }
        if (kind !== undefined && !KINDS.has(kind)) {
          return json(res, 400, { ok: false, error: "kind must be correction|mark|question" });
        }
        if (kind !== undefined) onExternalCommand?.();
        const events = pipeline(text, {
          kind: kind as "correction" | "mark" | "question" | undefined,
        });
        return json(res, 200, { ok: true, events: events.map((e) => e.type) });
      }
      json(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      json(res, 500, { ok: false, error: String(err).slice(0, 200) });
    }
  });
  server.listen(cfg.cmdPort, "127.0.0.1", () => {
    console.log(
      `[voice] command server: http://127.0.0.1:${cfg.cmdPort} (POST /command {"text","kind?"} · POST /say · GET /health)`,
    );
  });
  server.on("error", (err) => {
    console.error(`[voice] command server error: ${String(err).slice(0, 200)}`);
  });
  return server;
}
