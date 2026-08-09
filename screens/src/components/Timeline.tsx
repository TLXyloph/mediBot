// src/components/Timeline.tsx
"use client"

import type { ConvexEvent } from "@/types/events"

const TYPE_COLORS: Record<string, string> = {
  utterance: "text-slate-400",
  vital: "text-cyan-400",
  medication: "text-yellow-400",
  intervention: "text-orange-400",
  symptom: "text-purple-400",
  correction: "text-rose-400",
  flag: "text-red-400",
  protocol_state: "text-green-400",
  timer: "text-green-400",
  sbar_update: "text-blue-400",
}

function payloadSummary(e: ConvexEvent): string {
  const p = e.payload
  if (p.text) return String(p.text).slice(0, 80)
  if (p.name) return String(p.name)
  if (p.hr || p.spo2 || p.sbp)
    return `HR ${p.hr ?? "–"} SpO₂ ${p.spo2 ?? "–"} BP ${p.sbp ?? "–"}/${p.dbp ?? "–"}`
  return JSON.stringify(p).slice(0, 80)
}

export function Timeline({ events }: { events: ConvexEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-slate-500 text-lg text-center py-8">
        Waiting for events…
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto max-h-[40vh] pr-1">
      {[...events].reverse().map((e) => (
        <div
          key={e._id}
          className="flex items-start gap-3 text-base font-mono bg-neutral-900 rounded px-3 py-2"
        >
          <span className="text-neutral-500 shrink-0">
            {new Date(e.ts).toLocaleTimeString()}
          </span>
          <span
            className={`shrink-0 uppercase text-xs font-bold w-28 ${
              TYPE_COLORS[e.type] ?? "text-white"
            }`}
          >
            {e.type}
          </span>
          <span className="text-neutral-300 truncate text-lg">{payloadSummary(e)}</span>
          <span className="text-neutral-600 shrink-0 text-xs">{e.role}</span>
        </div>
      ))}
    </div>
  )
}
