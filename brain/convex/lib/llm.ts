// ~The 5-line insurance wrapper from the plan: every agent calls models only
// through llm(), so flipping providers is an env flag (LLM_PROVIDER), not code.
//
// Gemini goes through the official @google/genai SDK (the raw :generateContent
// REST endpoint was retired on this account — Aug 2026 — so callers of it 404).
// Because of the SDK, files importing this module must be Convex "use node"
// actions. Secrets come from Convex env vars (npx convex env set ...).

import { GoogleGenAI } from "@google/genai";

export function llmConfigured(): boolean {
  const provider = process.env.LLM_PROVIDER ?? "gemini";
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
  if (provider === "openai") return !!process.env.OPENAI_API_KEY;
  return false;
}

// Returns raw model text. Callers ask for JSON and parse it themselves.
// `responseSchema` (Gemini structured output) constrains the model to valid JSON
// of that shape — eliminating the malformed-JSON class of failure.
export async function llm(
  prompt: string,
  system?: string,
  responseSchema?: any,
): Promise<string> {
  const provider = process.env.LLM_PROVIDER ?? "gemini";
  if (provider === "gemini") return geminiGenerate(prompt, system, responseSchema);
  if (provider === "openai") return openaiGenerate(prompt, system);
  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}

let _genai: GoogleGenAI | null = null;
function genai(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  return (_genai ??= new GoogleGenAI({ apiKey: key }));
}

async function geminiGenerate(
  prompt: string,
  system?: string,
  responseSchema?: any,
): Promise<string> {
  // flash-lite-latest: ~0.6s, correct extraction, and a maintained alias so it
  // won't get deprecated mid-demo (which is exactly what killed gemini-2.5-flash).
  const model = process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";
  const res = await genai().models.generateContent({
    model,
    contents: prompt,
    config: {
      ...(system ? { systemInstruction: system } : {}),
      responseMimeType: "application/json",
      ...(responseSchema ? { responseSchema } : {}),
      temperature: 0,
    },
  });
  return res.text ?? "";
}

async function openaiGenerate(prompt: string, system?: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}
