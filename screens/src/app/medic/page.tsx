"use client"

import { useState } from "react"
import { useQuery } from "convex/react"
import { anyApi } from "convex/server"
import { Clock3, FileCheck2, ShieldCheck, X } from "lucide-react"

import { CompletenessBar } from "@/components/CompletenessBar"
import { EPCRPanel } from "@/components/EPCRPanel"
import { FullscreenButton } from "@/components/FullscreenButton"
import { MedCrewHeader } from "@/components/MedCrewHeader"
import { Timeline } from "@/components/Timeline"
import { deriveEPCR } from "@/lib/derive"
import type { ConvexEvent } from "@/types/events"
import styles from "../clinical.module.css"

export default function MedicPage() {
  const events = (useQuery(anyApi.events.timeline, {}) ?? []) as ConvexEvent[]
  const epcr = deriveEPCR(events)
  const [provenanceId, setProvenanceId] = useState<string | null>(null)
  const provenanceEvent = provenanceId ? events.find((event) => event._id === provenanceId) : null

  return (
    <main className={styles.shell}>
      <MedCrewHeader status="Convex live" />

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Verified patient record</p>
          <h1>One patient,<br /><em>one verified story.</em></h1>
          <p className={styles.lead}>Every field stays linked to the voice, vision, or medic event that created it.</p>
        </div>
        <div className={styles.heroAction}>
          <ShieldCheck size={22} />
          <span><small>Append-only record</small><strong>{events.length} verified events</strong></span>
          <FullscreenButton />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="record-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span><FileCheck2 size={18} />Current record</span>
            <h2 id="record-heading">ePCR, built as care happens.</h2>
          </div>
          <p>Select a populated field to inspect its source event.</p>
        </div>
        <CompletenessBar epcr={epcr} />
        <div className={styles.panelSpace}>
          <EPCRPanel epcr={epcr} onFieldClick={setProvenanceId} />
        </div>
      </section>

      <section className={`${styles.section} ${styles.timelineSection}`} aria-labelledby="timeline-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span><Clock3 size={18} />Provenance timeline</span>
            <h2 id="timeline-heading">What happened, in order.</h2>
          </div>
          <p>Corrections preserve the original source instead of overwriting history.</p>
        </div>
        <Timeline events={events} />
      </section>

      {provenanceEvent && (
        <div className={styles.modalBackdrop} onClick={() => setProvenanceId(null)} role="presentation">
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="source-heading" onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.modalClose} onClick={() => setProvenanceId(null)} aria-label="Close source event"><X size={19} /></button>
            <p className={styles.eyebrow}>Source event</p>
            <h2 id="source-heading">Why this field is here.</h2>
            <p className={styles.modalMeta}>{new Date(provenanceEvent.ts).toLocaleTimeString()} · {provenanceEvent.source} · {provenanceEvent.role}</p>
            <p className={styles.modalPayload}>{String(provenanceEvent.payload.text ?? JSON.stringify(provenanceEvent.payload))}</p>
          </section>
        </div>
      )}
    </main>
  )
}
