// ~The 5-line insurance wrapper from the plan: every agent calls models only
// through llm(), so flipping providers is an env flag (LLM_PROVIDER), not code.
//
// Uses plain fetch (no SDK) so it runs in Convex's default runtime with no extra
// deps. Secrets come from Convex deployment env vars (npx convex env set ...).

export function llmConfigured(): boolean {
  const provider = process.env.LLM_PROVIDER ?? "gemini";
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
  if (provider === "openai") return !!process.env.OPENAI_API_KEY;
  return false;
}

// Returns raw model text. Callers ask for JSON and parse it themselves.
export async function llm(prompt: string, system?: string): Promise<string> {
  const provider = process.env.LLM_PROVIDER ?? "gemini";
  if (provider === "gemini") return geminiGenerate(prompt, system);
  if (provider === "openai") return openaiGenerate(prompt, system);
  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}

async function geminiGenerate(prompt: string, system?: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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
