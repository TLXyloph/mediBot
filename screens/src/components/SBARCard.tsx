"use client"

import type { EPCRData } from "@/lib/derive"

export function SBARCard({ epcr }: { epcr: EPCRData }) {
  const latest = epcr.sbarUpdates[epcr.sbarUpdates.length - 1]
  const text = latest ? String(latest.payload.text ?? JSON.stringify(latest.payload)) : null

  return (
    <div className="bg-blue-950 border border-blue-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-2xl font-bold text-blue-300">SBAR Handoff</h3>
        {latest && (
          <span className="text-sm text-blue-400">
            {new Date(latest.ts).toLocaleTimeString()}
          </span>
        )}
      </div>
      {text ? (
        <p className="text-xl leading-relaxed text-white whitespace-pre-wrap">{text}</p>
      ) : (
        <p className="text-xl text-blue-500 italic">Pending — agents are composing…</p>
      )}
    </div>
  )
}
