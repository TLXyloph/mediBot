import { verifyA1RelayToken, verifyA1Signature, voiceTexml } from "@/lib/server/a1mobile"

function xml(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "application/xml; charset=utf-8" } })
}

export async function POST(request: Request) {
  const raw = await request.text()
  const requestUrl = new URL(request.url)
  if (
    !verifyA1Signature(raw, request.headers.get("x-a1-signature")) &&
    !verifyA1RelayToken(requestUrl.searchParams.get("relay"))
  ) {
    return new Response("Invalid relay signature", { status: 401 })
  }
  const action = new URL("/api/a1mobile/voice/response", requestUrl.origin)
  const relay = requestUrl.searchParams.get("relay")
  if (relay) action.searchParams.set("relay", relay)
  return xml(voiceTexml(action.toString()))
}

export async function GET(request: Request) {
  const action = `${new URL(request.url).origin}/api/a1mobile/voice/response`
  return xml(voiceTexml(action))
}
