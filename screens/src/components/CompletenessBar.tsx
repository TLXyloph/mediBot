"use client"

import { completeness, REQUIRED_FIELDS } from "@/lib/derive"
import type { EPCRData } from "@/lib/derive"

export function CompletenessBar({ epcr }: { epcr: EPCRData }) {
  const pct = Math.round(completeness(epcr) * 100)
  const color =
    pct === 100
      ? "bg-green-500"
      : pct >= 60
      ? "bg-yellow-500"
      : "bg-red-500"

  const filledKeys = new Set(
    REQUIRED_FIELDS.filter(({ key }) => {
      const val = epcr[key]
      if (typeof val === "string") return val.length > 0
      if (Array.isArray(val)) return val.length > 0
      return false
    }).map(({ key }) => key)
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="flex-1 h-3 bg-neutral-800 rounded-full overflow-hidden"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-lg font-bold tabular-nums">{pct}%</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {REQUIRED_FIELDS.map(({ key, label }) => (
          <span
            key={key}
            className={`text-xs px-2 py-0.5 rounded-full ${
              filledKeys.has(key)
                ? "bg-green-900 text-green-300"
                : "bg-neutral-800 text-neutral-500"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
