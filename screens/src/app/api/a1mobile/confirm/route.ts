import { confirmDestination } from "@/lib/server/a1mobile"
import type { CoordinationResult } from "@/lib/coordination"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { result?: CoordinationResult; hospitalId?: unknown }
    if (!body.result || typeof body.hospitalId !== "string") {
      return Response.json({ error: "A coordination result and hospital are required" }, { status: 400 })
    }
    return Response.json(await confirmDestination(body.result, body.hospitalId))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Destination confirmation failed"
    return Response.json({ error: message }, { status: 422 })
  }
}
