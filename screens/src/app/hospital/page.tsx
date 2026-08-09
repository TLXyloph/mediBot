"use client"

import { useQuery } from "convex/react"
import { anyApi } from "convex/react"
import { deriveEPCR } from "@/lib/derive"
import { VitalsTrendChart } from "@/components/VitalsTrendChart"
import { InterventionsList } from "@/components/InterventionsList"
import { SBARCard } from "@/components/SBARCard"
import { FlagFlash } from "@/components/FlagFlash"
import type { ConvexEvent } from "@/types/events"

export default function HospitalPage() {
  const events = (useQuery(anyApi.events.timeline) ?? []) as ConvexEvent[]
  const epcr = deriveEPCR(events)

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-6 flex flex-col gap-8">
      <FlagFlash flags={epcr.flags} />

      <header className="flex items-center justify-between">
        <h1 className="text-5xl font-bold tracking-tight">MediBot</h1>
        <span className="text-2xl text-neutral-400">Hospital View</span>
      </header>

      <SBARCard epcr={epcr} />

      <section>
        <h2 className="text-3xl font-semibold mb-4 text-neutral-300">Vitals Trend</h2>
        <VitalsTrendChart vitals={epcr.vitals} />
      </section>

      <section>
        <h2 className="text-3xl font-semibold mb-4 text-neutral-300">Interventions & Medications</h2>
        <InterventionsList epcr={epcr} />
      </section>
    </main>
  )
}
