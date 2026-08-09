import { a1Status } from "@/lib/server/a1mobile"

export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json(await a1Status())
}
