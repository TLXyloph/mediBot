// src/app/medic/page.tsx
"use client"

import { useQuery } from "convex/react"
import { anyApi } from "convex/react"
import { Timeline } from "@/components/Timeline"
import type { ConvexEvent } from "@/types/events"

export default function MedicPage() {
  const events = (useQuery(anyApi.events.timeline) ?? []) as ConvexEvent[]

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-4 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">MediBot</h1>
        <span className="text-lg text-neutral-400">Medic View</span>
      </header>

      <section>
        <h2 className="text-xl font-semibold mb-2 text-neutral-300">Event Timeline</h2>
        <Timeline events={events} />
      </section>
    </main>
  )
}
