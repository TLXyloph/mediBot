export const dynamic = "force-dynamic"

export function GET() {
  return Response.json({
    configured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_VISION_MODEL ?? "gemini-3.1-flash-lite-preview",
    convexConfigured: Boolean(process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL),
  })
}
