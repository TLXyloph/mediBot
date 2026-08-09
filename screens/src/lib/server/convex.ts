import "server-only"

import { ConvexHttpClient } from "convex/browser"
import { anyApi, type FunctionReference } from "convex/server"

import type { ConvexEvent } from "@/types/events"

function reference<Type extends "mutation" | "query">(
  path: string,
): FunctionReference<Type, "public", Record<string, unknown>, unknown> {
  const [moduleName, functionName, ...rest] = path.split(":")
  if (!moduleName || !functionName || rest.length) throw new Error(`Invalid Convex function: ${path}`)
  const api = anyApi as unknown as Record<string, Record<string, unknown>>
  return api[moduleName]?.[functionName] as FunctionReference<Type, "public", Record<string, unknown>, unknown>
}

function client(): ConvexHttpClient | null {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL
  return url ? new ConvexHttpClient(url) : null
}

export async function appendEvent(event: Omit<ConvexEvent, "_id" | "_creationTime">): Promise<void> {
  const convex = client()
  if (!convex) return
  await convex.mutation(reference<"mutation">(process.env.CONVEX_APPEND_FUNCTION ?? "events:append"), event)
}

export async function timeline(limit = 200): Promise<ConvexEvent[]> {
  const convex = client()
  if (!convex) return []
  return (await convex.query(reference<"query">("events:timeline"), { limit })) as ConvexEvent[]
}

export async function patientState(): Promise<Record<string, unknown>> {
  const convex = client()
  if (!convex) return {}
  return (await convex.query(
    reference<"query">(process.env.CONVEX_PATIENT_STATE_FUNCTION ?? "patientState:patientState"),
    {},
  )) as Record<string, unknown>
}

export async function latestSbar(): Promise<Record<string, unknown>> {
  const convex = client()
  if (!convex) return {}
  return (await convex.query(reference<"query">(process.env.CONVEX_SBAR_FUNCTION ?? "sbar:sbar"), {})) as Record<
    string,
    unknown
  >
}
