"use client"

import type { EPCRData } from "@/lib/derive"
import type { ConvexEvent } from "@/types/events"
import styles from "./InterventionsList.module.css"

function EventRow({ e, kind }: { e: ConvexEvent; kind: "medication" | "intervention" }) {
  const label = String(e.payload.name ?? e.payload.text ?? "")
  return (
    <div className={styles.event}>
      <span className={`${styles.badge} ${styles[kind]}`}>
        {e.type}
      </span>
      <strong>{label}</strong>
      <time>
        {new Date(e.ts).toLocaleTimeString()}
      </time>
    </div>
  )
}

export function InterventionsList({ epcr }: { epcr: EPCRData }) {
  const combined = [
    ...epcr.medications.map((e) => ({ e, kind: "medication" as const })),
    ...epcr.interventions.map((e) => ({ e, kind: "intervention" as const })),
  ].sort((a, b) => a.e.ts - b.e.ts)

  if (combined.length === 0) {
    return (
      <p className={styles.empty}>None yet</p>
    )
  }

  return (
    <div className={styles.list}>
      {combined.map(({ e, kind }) => (
        <EventRow key={e._id} e={e} kind={kind} />
      ))}
    </div>
  )
}
