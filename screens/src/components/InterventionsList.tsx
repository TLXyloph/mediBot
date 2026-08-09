"use client"

import type { EPCRData } from "@/lib/derive"
import type { ConvexEvent } from "@/types/events"

function EventRow({ e, badgeColor }: { e: ConvexEvent; badgeColor: string }) {
  const label = String(e.payload.name ?? e.payload.text ?? "")
  return (
    <div className="flex items-center gap-3 py-2 border-b border-neutral-800 last:border-0">
      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${badgeColor}`}>
        {e.type}
      </span>
      <span className="text-xl flex-1">{label}</span>
      <span className="text-sm text-neutral-500">
        {new Date(e.ts).toLocaleTimeString()}
      </span>
    </div>
  )
}

export function InterventionsList({ epcr }: { epcr: EPCRData }) {
  const combined = [
    ...epcr.medications.map((e) => ({ e, color: "bg-yellow-900 text-yellow-300" })),
    ...epcr.interventions.map((e) => ({ e, color: "bg-orange-900 text-orange-300" })),
  ].sort((a, b) => a.e.ts - b.e.ts)

  if (combined.length === 0) {
    return (
      <p className="text-neutral-500 text-lg text-center py-4">None yet</p>
    )
  }

  return (
    <div>
      {combined.map(({ e, color }) => (
        <EventRow key={e._id} e={e} badgeColor={color} />
      ))}
    </div>
  )
}
