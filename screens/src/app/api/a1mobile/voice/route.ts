import { verifyA1Signature, voiceTexml } from "@/lib/server/a1mobile"

function xml(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "application/xml; charset=utf-8" } })
}

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyA1Signature(raw, request.headers.get("x-a1-signature"))) {
    return new Response("Invalid relay signature", { status: 401 })
  }
  const action = `${new URL(request.url).origin}/api/a1mobile/voice/response`
  return xml(voiceTexml(action))
}

export async function GET(request: Request) {
  const action = `${new URL(request.url).origin}/api/a1mobile/voice/response`
  return xml(voiceTexml(action))
}
