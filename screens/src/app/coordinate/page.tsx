"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { anyApi } from "convex/server"
import { Ambulance, Check, CircleX, Clock3, Hospital, LoaderCircle, PhoneCall, Route, ShieldCheck } from "lucide-react"

import { MedCrewHeader } from "@/components/MedCrewHeader"
import { latestVitals } from "@/lib/clinical"
import type { CoordinationPatient, CoordinationResult } from "@/lib/coordination"
import { deriveEPCR } from "@/lib/derive"
import type { ConvexEvent } from "@/types/events"
import styles from "./coordinate.module.css"

interface A1Status {
  configured: boolean
  realCallsEnabled: boolean
  phoneNumber: string | null
  wiringMode: string | null
}

export default function CoordinatePage() {
  const queriedEvents = useQuery(anyApi.events.timeline, { limit: 300 }) as ConvexEvent[] | undefined
  const events = useMemo(() => queriedEvents ?? [], [queriedEvents])
  const epcr = useMemo(() => deriveEPCR(events), [events])
  const vitals = useMemo(() => latestVitals(events), [events])
  const [status, setStatus] = useState<A1Status | null>(null)
  const [result, setResult] = useState<CoordinationResult | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [message, setMessage] = useState("Ready to contact receiving hospitals")

  useEffect(() => {
    fetch("/api/a1mobile/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((value: A1Status) => setStatus(value))
      .catch(() => setStatus({ configured: false, realCallsEnabled: false, phoneNumber: null, wiringMode: null }))
  }, [])

  const chiefComplaint = useMemo(() => {
    const values = (epcr.chiefComplaint || "crushing chest pain with hypotension")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)
    return [...new Map(values.map((value) => [value.toLowerCase(), value])).values()].slice(0, 2).join("; ")
  }, [epcr.chiefComplaint])

  const patient: CoordinationPatient = useMemo(() => ({
    age: Number(epcr.age) || 54,
    sex: "male",
    chiefComplaint,
    symptoms: chiefComplaint ? [chiefComplaint] : ["chest pain", "diaphoresis", "weakness"],
    medications: epcr.medications.map((event) => String(event.payload.name ?? event.payload.text ?? "")).filter(Boolean),
    allergies: events.filter((event) => event.type === "symptom" && event.payload.allergy).map((event) => String(event.payload.allergy)),
    interventions: epcr.interventions.map((event) => String(event.payload.name ?? event.payload.text ?? "")).filter(Boolean),
    vitals,
  }), [chiefComplaint, epcr, events, vitals])

  const begin = async () => {
    setLoading(true)
    setConfirmed(null)
    setMessage("Determining requirements and calling hospitals…")
    try {
      const response = await fetch("/api/a1mobile/coordinate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patient }),
      })
      const value = (await response.json()) as CoordinationResult & { error?: string }
      if (!response.ok) throw new Error(value.error ?? "Hospital coordination failed")
      setResult(value)
      setSelected(value.recommendedHospitalId)
      setMessage(value.mode === "live" ? "Verified calls placed. Receiving results ranked." : "Demo hospital agents answered. Results ranked.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hospital coordination failed")
    } finally {
      setLoading(false)
    }
  }

  const confirm = async () => {
    if (!result || !selected) return
    setLoading(true)
    setMessage("Confirming destination and starting live handoff…")
    try {
      const response = await fetch("/api/a1mobile/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result, hospitalId: selected }),
      })
      const value = (await response.json()) as { confirmedHospitalId?: string; handoffSent?: boolean; error?: string }
      if (!response.ok || !value.confirmedHospitalId) throw new Error(value.error ?? "Confirmation failed")
      setConfirmed(value.confirmedHospitalId)
      setMessage(value.handoffSent ? "Destination confirmed. Live SBAR sent by A1mobile." : "Destination confirmed. Live SBAR is streaming through Convex.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Confirmation failed")
    } finally {
      setLoading(false)
    }
  }

  const recommended = result?.hospitals.find((hospital) => hospital.id === result.recommendedHospitalId)

  return (
    <main className={styles.shell}>
      <MedCrewHeader status={status?.realCallsEnabled ? "A1mobile live" : "A1mobile demo"} />
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Hospital coordination agent</p>
          <h1>Find the right bed,<br /><em>before arrival.</em></h1>
        </div>
        <div className={styles.connection}>
          <PhoneCall size={24} />
          <span><small>MedCrew number</small><strong>{status?.phoneNumber ?? "+1 443-601-8773"}</strong></span>
        </div>
      </section>

      <section className={styles.patientLine} aria-label="Current patient summary">
        <span><Ambulance size={20} />{patient.age}M · {patient.chiefComplaint}</span>
        <span>BP {vitals.systolicMmHg}/{vitals.diastolicMmHg}</span>
        <span>SpO₂ {vitals.spo2Pct}%</span>
        <span>HR {vitals.hrBpm}</span>
      </section>

      <div className={styles.layout}>
        <section>
          <div className={styles.flowHeading}>
            <div>
              <p>{result ? "Receiving responses" : "Ready to coordinate"}</p>
              <h2>{result ? `${result.requirements.capabilities.join(" + ")} required` : "One action. Three hospital agents."}</h2>
            </div>
            <button type="button" className={styles.callButton} onClick={begin} disabled={loading}>
              {loading ? <LoaderCircle className={styles.spin} size={20} /> : <PhoneCall size={20} />}
              {result ? "Call again" : "Call receiving hospitals"}
            </button>
          </div>

          <p className={styles.status} role="status">{message}</p>

          <div className={styles.hospitals}>
            {(result?.hospitals ?? []).map((hospital, index) => (
              <button
                key={hospital.id}
                type="button"
                className={`${styles.hospitalRow} ${selected === hospital.id ? styles.selected : ""}`}
                onClick={() => hospital.eligible && setSelected(hospital.id)}
                disabled={!hospital.eligible}
              >
                <span className={styles.rank}>{hospital.eligible ? String(index + 1).padStart(2, "0") : "—"}</span>
                <span className={styles.hospitalName}>
                  <strong>{hospital.name}</strong>
                  <small>{hospital.capabilities.join(" · ")}</small>
                </span>
                <span className={hospital.accepted ? styles.accept : styles.decline}>
                  {hospital.accepted ? <Check size={17} /> : <CircleX size={17} />}
                  {hospital.accepted ? "Accept" : hospital.reason ?? "Unavailable"}
                </span>
                <span><Route size={17} />{hospital.travelMinutes} min</span>
                <span><Clock3 size={17} />{hospital.offloadMinutes === null ? "—" : `${hospital.offloadMinutes} min`}</span>
                <strong className={styles.score}>{hospital.score === null ? "—" : hospital.score}</strong>
              </button>
            ))}
            {!result && (
              <div className={styles.empty}>
                <Hospital size={36} strokeWidth={1.5} />
                <p>MedCrew will ask UCSF, SF General, and St. Mary’s about acceptance, capability, and offload time.</p>
              </div>
            )}
          </div>
        </section>

        <aside className={styles.recommendation}>
          <p className={styles.eyebrow}>Medic decision</p>
          <h2>{recommended ? `${recommended.name} is the fastest safe handoff.` : "Results appear here as hospitals answer."}</h2>
          <p>{result?.requirements.rationale ?? "Travel time, offload delay, and required clinical capability are ranked together."}</p>
          {recommended && (
            <div className={styles.math}>
              <span>{recommended.travelMinutes}<small>travel</small></span>
              <i>+</i>
              <span>{recommended.offloadMinutes}<small>offload</small></span>
              <i>=</i>
              <span className={styles.total}>{recommended.score}<small>total min</small></span>
            </div>
          )}
          <button type="button" className={styles.confirmButton} onClick={confirm} disabled={!selected || loading || Boolean(confirmed)}>
            {confirmed ? <ShieldCheck size={21} /> : <Check size={21} />}
            {confirmed ? "Destination confirmed" : `Confirm ${result?.hospitals.find((hospital) => hospital.id === selected)?.name ?? "destination"}`}
          </button>
          <small className={styles.safety}>Medic remains the final decision-maker. Only OTP-verified numbers can receive calls or texts.</small>
        </aside>
      </div>
    </main>
  )
}
