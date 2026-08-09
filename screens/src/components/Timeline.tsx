// src/components/Timeline.tsx
"use client"

import type { ConvexEvent } from "@/types/events"
import styles from "./Timeline.module.css"

const TYPE_COLORS: Record<string, string> = {
  utterance: styles.utterance,
  vital: styles.vital,
  medication: styles.medication,
  intervention: styles.intervention,
  symptom: styles.symptom,
  correction: styles.correction,
  flag: styles.flag,
  protocol_state: styles.protocol,
  timer: styles.timer,
  sbar_update: styles.sbar,
}

function payloadSummary(e: ConvexEvent): string {
  const p = e.payload
  if (p.text) return String(p.text).slice(0, 80)
  if (p.name) return String(p.name)
  if (p.hr || p.spo2 || p.sbp)
    return `HR ${p.hr ?? "–"} SpO₂ ${p.spo2 ?? "–"} BP ${p.sbp ?? "–"}/${p.dbp ?? "–"}`
  return JSON.stringify(p).slice(0, 80)
}

export function Timeline({ events }: { events: ConvexEvent[] }) {
  if (events.length === 0) {
    return (
      <p className={styles.empty}>
        Waiting for events…
      </p>
    )
  }

  return (
    <div className={styles.timeline}>
      {[...events].reverse().map((e) => (
        <div
          key={e._id}
          className={styles.event}
        >
          <time>
            {new Date(e.ts).toLocaleTimeString()}
          </time>
          <span
            className={`${styles.type} ${TYPE_COLORS[e.type] ?? styles.utterance}`}
          >
            {e.type}
          </span>
          <span className={styles.summary}>{payloadSummary(e)}</span>
          <span className={styles.role}>{e.role}</span>
        </div>
      ))}
    </div>
  )
}
