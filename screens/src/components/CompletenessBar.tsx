"use client"

import { completeness, REQUIRED_FIELDS } from "@/lib/derive"
import type { EPCRData } from "@/lib/derive"
import { Check } from "lucide-react"

import styles from "./CompletenessBar.module.css"

export function CompletenessBar({ epcr }: { epcr: EPCRData }) {
  const pct = Math.round(completeness(epcr) * 100)
  const filledKeys = new Set(
    REQUIRED_FIELDS.filter(({ key }) => {
      const val = epcr[key]
      if (typeof val === "string") return val.length > 0
      if (Array.isArray(val)) return val.length > 0
      return false
    }).map(({ key }) => key)
  )

  return (
    <div className={styles.completeness}>
      <div className={styles.progressLine}>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className={styles.track}
        >
          <div
            className={styles.fill}
            style={{ width: `${pct}%` }}
          />
        </div>
        <strong>{pct}%</strong>
      </div>
      <div className={styles.fields}>
        {REQUIRED_FIELDS.map(({ key, label }) => (
          <span
            key={key}
            className={filledKeys.has(key) ? styles.complete : styles.pending}
          >
            <Check size={13} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
