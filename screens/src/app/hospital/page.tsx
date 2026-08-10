"use client"

import { useQuery } from "convex/react"
import { anyApi } from "convex/server"
import { Activity, Pill, RadioTower } from "lucide-react"

import { FlagFlash } from "@/components/FlagFlash"
import { FullscreenButton } from "@/components/FullscreenButton"
import { InterventionsList } from "@/components/InterventionsList"
import { MedCrewHeader } from "@/components/MedCrewHeader"
import { SBARCard } from "@/components/SBARCard"
import { VitalsTrendChart } from "@/components/VitalsTrendChart"
import { deriveEPCR } from "@/lib/derive"
import type { ConvexEvent } from "@/types/events"
import styles from "../clinical.module.css"

export default function HospitalPage() {
  const events = (useQuery(anyApi.events.timeline, {}) ?? []) as ConvexEvent[]
  const epcr = deriveEPCR(events)

  return (
    <main className={styles.shell}>
      <MedCrewHeader status="Receiving live" />
      <div className={styles.alertSpace}><FlagFlash flags={epcr.flags} /></div>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Hospital receiving view</p>
          <h1>Arrive already<br /><em>understood.</em></h1>
          <p className={styles.lead}>Verified vitals, interventions, and the live SBAR reach the receiving team before the ambulance does.</p>
        </div>
        <div className={styles.heroAction}>
          <RadioTower size={22} />
          <span><small>Live handoff</small><strong>Streaming from Convex</strong></span>
          <FullscreenButton />
        </div>
      </section>

      <section className={styles.section} aria-label="SBAR handoff">
        <SBARCard epcr={epcr} />
      </section>

      <div className={styles.hospitalGrid}>
        <section className={styles.section} aria-labelledby="vitals-trend-heading">
          <div className={styles.sectionHeading}>
            <div>
              <span><Activity size={18} />Patient trajectory</span>
              <h2 id="vitals-trend-heading">Vitals trend</h2>
            </div>
          </div>
          <div className={styles.chartPanel}><VitalsTrendChart vitals={epcr.vitals} /></div>
        </section>

        <section className={styles.section} aria-labelledby="care-given-heading">
          <div className={styles.sectionHeading}>
            <div>
              <span><Pill size={18} />Care already given</span>
              <h2 id="care-given-heading">Interventions & medications</h2>
            </div>
          </div>
          <div className={styles.listPanel}><InterventionsList epcr={epcr} /></div>
        </section>
      </div>
    </main>
  )
}
