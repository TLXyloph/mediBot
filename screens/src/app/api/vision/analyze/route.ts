import { analyzeMonitor } from "@/lib/server/vision"

export const maxDuration = 30

export async function POST(request: Request) {
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return Response.json({ error: "JSON is required" }, { status: 415 })
    }
    const body = (await request.json()) as { image?: unknown }
    if (typeof body.image !== "string") {
      return Response.json({ error: "A monitor image is required" }, { status: 400 })
    }
    return Response.json(await analyzeMonitor(body.image))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Monitor analysis failed"
    return Response.json({ error: message }, { status: message.includes("configured") ? 503 : 422 })
  }
}
