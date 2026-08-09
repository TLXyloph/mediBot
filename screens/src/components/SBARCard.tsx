"use client"

import type { EPCRData } from "@/lib/derive"
import styles from "./SBARCard.module.css"

export function SBARCard({ epcr }: { epcr: EPCRData }) {
  const latest = epcr.sbarUpdates[epcr.sbarUpdates.length - 1]
  const p = latest?.payload as { situation?: string; background?: string; assessment?: string; recommendation?: string; text?: string } | undefined
  const hasContent = p && (p.situation || p.background || p.assessment || p.recommendation || p.text)

  return (
    <section className={styles.sbar}>
      <div className={styles.heading}>
        <div>
          <span>Live receiving brief</span>
          <h3>SBAR handoff</h3>
        </div>
        {latest && (
          <time>
            {new Date(latest.ts).toLocaleTimeString()}
          </time>
        )}
      </div>
      {hasContent ? (
        p?.text ? (
          <p className={styles.narrative}>{p.text}</p>
        ) : (
          <dl className={styles.sections}>
            {p?.situation && <div><dt>Situation</dt><dd>{p.situation}</dd></div>}
            {p?.background && <div><dt>Background</dt><dd>{p.background}</dd></div>}
            {p?.assessment && <div><dt>Assessment</dt><dd>{p.assessment}</dd></div>}
            {p?.recommendation && <div><dt>Recommendation</dt><dd>{p.recommendation}</dd></div>}
          </dl>
        )
      ) : (
        <p className={styles.pending}>Pending — agents are composing…</p>
      )}
    </section>
  )
}
