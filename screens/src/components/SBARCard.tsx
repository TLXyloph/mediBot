"use client"

import type { EPCRData } from "@/lib/derive"

export function SBARCard({ epcr }: { epcr: EPCRData }) {
  const latest = epcr.sbarUpdates[epcr.sbarUpdates.length - 1]
  const p = latest?.payload as { situation?: string; background?: string; assessment?: string; recommendation?: string; text?: string } | undefined
  const hasContent = p && (p.situation || p.background || p.assessment || p.recommendation || p.text)

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
      {hasContent ? (
        p?.text ? (
          <p className="text-xl leading-relaxed text-white whitespace-pre-wrap">{p.text}</p>
        ) : (
          <dl className="flex flex-col gap-2 text-lg">
            {p?.situation && <div><dt className="text-blue-400 text-sm uppercase tracking-widest">Situation</dt><dd className="text-white">{p.situation}</dd></div>}
            {p?.background && <div><dt className="text-blue-400 text-sm uppercase tracking-widest">Background</dt><dd className="text-white">{p.background}</dd></div>}
            {p?.assessment && <div><dt className="text-blue-400 text-sm uppercase tracking-widest">Assessment</dt><dd className="text-white">{p.assessment}</dd></div>}
            {p?.recommendation && <div><dt className="text-blue-400 text-sm uppercase tracking-widest">Recommendation</dt><dd className="text-white">{p.recommendation}</dd></div>}
          </dl>
        )
      ) : (
        <p className="text-xl text-blue-500 italic">Pending — agents are composing…</p>
      )}
    </div>
  )
}
