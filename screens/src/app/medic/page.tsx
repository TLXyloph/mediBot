// src/app/medic/page.tsx
"use client"

import { useQuery } from "convex/react"
import { anyApi } from "convex/react"
import { Timeline } from "@/components/Timeline"
import { EPCRPanel } from "@/components/EPCRPanel"
import { CompletenessBar } from "@/components/CompletenessBar"
import { FullscreenButton } from "@/components/FullscreenButton"
import { deriveEPCR } from "@/lib/derive"
import type { ConvexEvent } from "@/types/events"
import { useState } from "react"

export default function MedicPage() {
  const events = (useQuery(anyApi.events.timeline) ?? []) as ConvexEvent[]
  const epcr = deriveEPCR(events)
  const [provenanceId, setProvenanceId] = useState<string | null>(null)
  const provenanceEvent = provenanceId
    ? events.find((e) => e._id === provenanceId)
    : null

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-4 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-5xl font-bold tracking-tight">MediBot</h1>
        <div className="flex items-center gap-4">
          <span className="text-xl text-neutral-400">Medic View</span>
          <FullscreenButton />
        </div>
      </header>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-semibold text-neutral-300">ePCR</h2>
        </div>
        <CompletenessBar epcr={epcr} />
        <div className="mt-3">
          <EPCRPanel epcr={epcr} onFieldClick={setProvenanceId} />
        </div>
      </section>

      {provenanceEvent && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setProvenanceId(null)}
        >
          <div className="bg-neutral-900 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <p className="text-xs text-neutral-500 mb-2">
              {new Date(provenanceEvent.ts).toLocaleTimeString()} · {provenanceEvent.source} · {provenanceEvent.role}
            </p>
            <p className="text-lg">{String(provenanceEvent.payload.text ?? JSON.stringify(provenanceEvent.payload))}</p>
            <p className="text-xs text-neutral-600 mt-3">Click anywhere to close</p>
          </div>
        </div>
      )}

      <section>
        <h2 className="text-2xl font-semibold mb-3 text-neutral-300">Timeline</h2>
        <Timeline events={events} />
      </section>
    </main>
  )
}
