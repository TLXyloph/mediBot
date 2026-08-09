import { GoogleGenAI, Modality } from "@google/genai"

export const dynamic = "force-dynamic"

// Mints a single-use ephemeral Live token for the browser ambient-scribe
// session (mirrors eyes/server/gemini.ts createLiveToken). The real key stays
// server-side; the browser only ever sees a short-lived constrained token.
export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY is not configured" }, { status: 503 })
  }
  const model = process.env.GEMINI_EARS_MODEL?.trim() || "gemini-3.1-flash-live-preview"
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } })
  const expires = new Date(Date.now() + 30 * 60_000)
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: expires.toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
      liveConnectConstraints: {
        model,
        config: { responseModalities: [Modality.AUDIO] },
      },
      httpOptions: { apiVersion: "v1alpha" },
    },
  })
  if (!token.name) {
    return Response.json({ error: "Gemini did not return an ephemeral token" }, { status: 502 })
  }
  return Response.json({ token: token.name, model, expiresAt: expires.toISOString() })
}
