#!/usr/bin/env node
// MediBot VoiceOS integration — local MCP server over stdio.
// Zero dependencies on purpose: VoiceOS may copy this folder on install, so we
// speak the MCP JSON-RPC protocol by hand (newline-delimited JSON-RPC 2.0).
// Each tool call POSTs to the Lane A command server (voice/: `npm run dev`).
//
// Install (VoiceOS app): Settings → Agent Mode → Integrations → Install from
// folder → pick voice/voiceos-integration. Reload the integration after edits.

import { createInterface } from "node:readline";

const PORT = Number(process.env.MEDIBOT_PORT || 4750);
const BASE = `http://127.0.0.1:${PORT}`;

const TOOLS = [
  {
    name: "medibot_correction",
    description:
      "Call when the user says 'correction' followed by corrected patient data, e.g. 'correction — BP 90 over 60'. Records a non-destructive amendment to the patient chart. Pass the corrected fact exactly as spoken, without the word 'correction'.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "The corrected fact exactly as spoken" } },
      required: ["text"],
    },
  },
  {
    name: "medibot_mark",
    description:
      "Call when the user asks Scribe (also answers to MediBot) to mark, log, or timestamp a clinical moment, e.g. 'mark epi given', 'mark time of arrest', 'mark ROSC'.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "What to mark, e.g. 'epi given'" } },
      required: ["text"],
    },
  },
  {
    name: "medibot_ask",
    description:
      "Call when the user asks Scribe (also answers to MediBot) a question about the patient, medications, vitals, or incident timeline, e.g. 'when was the last epi?'.",
    inputSchema: {
      type: "object",
      properties: { question: { type: "string", description: "The question exactly as asked" } },
      required: ["question"],
    },
  },
];

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MediBot voice service replied ${res.status}`);
  return res.json();
}

async function callTool(name, args) {
  const text = String(args?.text ?? args?.question ?? "").slice(0, 2000).trim();
  if (!text) return "Nothing to log — no text provided.";
  // Responses stay terse: VoiceOS's agent reads them aloud, and MediBot's own
  // TTS channel is already talking — keep the double-voice to a minimum.
  if (name === "medibot_correction") {
    await post("/command", { text, kind: "correction" });
    return "Logged.";
  }
  if (name === "medibot_mark") {
    await post("/command", { text, kind: "mark" });
    return "Marked.";
  }
  if (name === "medibot_ask") {
    await post("/command", { text, kind: "question" });
    return "MediBot will answer aloud.";
  }
  throw new Error(`unknown tool ${name}`);
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      reply(id, {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "medibot", version: "0.1.0" },
      });
    } else if (method === "notifications/initialized" || method === "notifications/cancelled") {
      // notifications: no response
    } else if (method === "ping") {
      reply(id, {});
    } else if (method === "tools/list") {
      reply(id, { tools: TOOLS });
    } else if (method === "tools/call") {
      try {
        const text = await callTool(params?.name, params?.arguments ?? {});
        reply(id, { content: [{ type: "text", text }], isError: false });
      } catch (err) {
        reply(id, {
          content: [
            {
              type: "text",
              text: `MediBot voice service is not reachable (${String(err?.message ?? err).slice(0, 120)}). Is \`npm run dev\` running in voice/?`,
            },
          ],
          isError: true,
        });
      }
    } else if (id !== undefined) {
      replyError(id, -32601, `method not found: ${method}`);
    }
  } catch (err) {
    if (id !== undefined) replyError(id, -32603, String(err?.message ?? err).slice(0, 200));
  }
});
