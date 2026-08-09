"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { anyApi } from "convex/server"
import {
  Activity,
  Ambulance,
  AudioLines,
  BrainCircuit,
  Check,
  CircleAlert,
  CircleX,
  Clock3,
  Database,
  FileCheck2,
  Hospital,
  LoaderCircle,
  PhoneCall,
  Radio,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { MedCrewHeader } from "@/components/MedCrewHeader"
import { latestVitals } from "@/lib/clinical"
import type { CoordinationPatient, CoordinationResult, HospitalResult } from "@/lib/coordination"
import { deriveEPCR } from "@/lib/derive"
import type { ConvexEvent } from "@/types/events"
import styles from "./coordinate.module.css"

interface A1Status {
  configured: boolean
  realCallsEnabled: boolean
  phoneNumber: string | null
  wiringMode: string | null
  webhookReady: boolean
  configuredTargetCount: number
  approvedTargetCount: number
  providerVerifiedTargetCount: number
  callableTargetCount: number
  outboundReady: boolean
  checkedAt: number
}

type PipelineState = "complete" | "active" | "waiting" | "attention"

interface PipelineStage {
  id: string
  label: string
  detail: string
  state: PipelineState
  icon: typeof Activity
}

const callTargets = [
  { id: "ucsf", name: "UCSF" },
  { id: "sf-general", name: "SF General" },
  { id: "st-marys", name: "St. Mary’s" },
]

function hospitalReply(hospital: HospitalResult | undefined): string {
  if (!hospital) return "Acceptance · capability · offload ETA"
  if (!hospital.accepted) return hospital.reason ?? "Unavailable"
  return `Accept · ${hospital.offloadMinutes ?? "—"} min offload`
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
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState<string | null>(null)
  const [message, setMessage] = useState("Ready to contact receiving hospitals")
  const [coordinationError, setCoordinationError] = useState(false)

  useEffect(() => {
    let mounted = true
    const refresh = () => {
      fetch("/api/a1mobile/status", { cache: "no-store" })
        .then((response) => response.json())
        .then((value: A1Status) => mounted && setStatus(value))
        .catch(() => mounted && setStatus({
          configured: false,
          realCallsEnabled: false,
          phoneNumber: null,
          wiringMode: null,
          webhookReady: false,
          configuredTargetCount: 0,
          approvedTargetCount: 0,
          providerVerifiedTargetCount: 0,
          callableTargetCount: 0,
          outboundReady: false,
          checkedAt: Date.now(),
        }))
    }
    refresh()
    const timer = window.setInterval(refresh, 15_000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
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
    setConfirming(false)
    setCoordinationError(false)
    setConfirmed(null)
    setMessage("Building verified SBAR and contacting hospital agents…")
    try {
      const minimumVisibleCallState = new Promise<void>((resolve) => window.setTimeout(resolve, 900))
      const responsePromise = fetch("/api/a1mobile/coordinate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patient }),
      })
      const [response] = await Promise.all([responsePromise, minimumVisibleCallState])
      const value = (await response.json()) as CoordinationResult & { error?: string }
      if (!response.ok) throw new Error(value.error ?? "Hospital coordination failed")
      setResult(value)
      setSelected(value.recommendedHospitalId)
      setMessage(value.mode === "live" ? "Verified calls placed. Receiving results ranked." : "Demo hospital agents replied. Results ranked.")
    } catch (error) {
      setCoordinationError(true)
      setMessage(error instanceof Error ? error.message : "Hospital coordination failed")
    } finally {
      setLoading(false)
    }
  }

  const confirm = async () => {
    if (!result || !selected) return
    setLoading(true)
    setConfirming(true)
    setCoordinationError(false)
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
      setCoordinationError(true)
      setMessage(error instanceof Error ? error.message : "Confirmation failed")
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  const recommended = result?.hospitals.find((hospital) => hospital.id === result.recommendedHospitalId)
  const acceptedCount = result?.hospitals.filter((hospital) => hospital.accepted).length ?? 0
  const hasObservedVitals = events.some((event) => event.type === "vital")

  const pipeline = useMemo<PipelineStage[]>(() => [
    {
      id: "capture",
      label: "Voice + monitor",
      detail: events.length ? `${events.length} care events captured` : "Patient inputs ready",
      state: queriedEvents === undefined ? "active" : "complete",
      icon: AudioLines,
    },
    {
      id: "understand",
      label: "Gemini understands",
      detail: hasObservedVitals ? "Vision evidence extracted" : "Vision + speech available",
      state: queriedEvents === undefined ? "waiting" : "complete",
      icon: Sparkles,
    },
    {
      id: "verify",
      label: "Convex verifies",
      detail: queriedEvents === undefined ? "Syncing patient state" : "Append-only state synced",
      state: queriedEvents === undefined ? "active" : "complete",
      icon: Database,
    },
    {
      id: "call",
      label: "A1mobile calls",
      detail: loading && !confirming ? "Contacting 3 ER agents" : result ? (result.mode === "live" ? "Verified calls placed" : "Demo agents queried") : "Ready to contact ERs",
      state: coordinationError ? "attention" : loading && !confirming ? "active" : result ? "complete" : "waiting",
      icon: PhoneCall,
    },
    {
      id: "respond",
      label: "Hospitals respond",
      detail: result ? `${acceptedCount} accepting · ETA returned` : loading && !confirming ? "Awaiting capacity + ETA" : "Acceptance + capability + ETA",
      state: coordinationError ? "attention" : result ? "complete" : loading && !confirming ? "active" : "waiting",
      icon: Hospital,
    },
    {
      id: "rank",
      label: "Destination ranked",
      detail: recommended ? `${recommended.name} recommended` : result ? "No eligible destination" : "Travel + offload + capability",
      state: recommended ? "complete" : result ? "attention" : "waiting",
      icon: BrainCircuit,
    },
    {
      id: "handoff",
      label: "Live handoff",
      detail: confirmed ? "SBAR streaming before arrival" : confirming ? "Confirming destination" : result ? "Medic confirmation required" : "Verified ePCR + SBAR ready",
      state: confirmed ? "complete" : confirming || result ? "active" : "waiting",
      icon: FileCheck2,
    },
  ], [acceptedCount, confirmed, confirming, coordinationError, events.length, hasObservedVitals, loading, queriedEvents, recommended, result])

  return (
    <main className={styles.shell}>
      <MedCrewHeader status={status?.outboundReady ? "A1mobile live ready" : status?.webhookReady ? "A1mobile webhook ready" : "A1mobile demo"} />
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

      <section className={styles.pipelineSection} aria-labelledby="pipeline-title">
        <div className={styles.pipelineHeading}>
          <div>
            <p className={styles.eyebrow}>Live care pipeline</p>
            <h2 id="pipeline-title">Every system, one visible handoff.</h2>
          </div>
          <span className={styles.pipelineLegend}><i /> Processing updates in real time</span>
        </div>
        <ol className={styles.pipeline} aria-live="polite">
          {pipeline.map((stage) => {
            const Icon = stage.icon
            return (
              <li key={stage.id} className={`${styles.pipelineStage} ${styles[stage.state]}`}>
                <span className={styles.stageIcon} aria-hidden="true"><Icon size={19} /></span>
                <span>
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      <section className={styles.callActivity} aria-labelledby="call-activity-title" aria-live="polite">
        <div className={styles.callActivityTop}>
          <div className={styles.callTitle}>
            <span><Radio size={21} /></span>
            <div>
              <p id="call-activity-title">A1mobile call activity</p>
              <small>{status?.outboundReady ? "Live outbound calling" : status?.webhookReady ? "Webhook connected · outbound safety locked" : "Safe demo agent mode"}</small>
            </div>
          </div>
          <span className={styles.modeBadge}>{result?.mode === "live" ? "LIVE CALLS" : status?.webhookReady ? "WEBHOOK READY" : "DEMO AGENTS"}</span>
        </div>

        <div className={styles.readiness} aria-label="A1mobile live calling readiness">
          <span className={status?.webhookReady ? styles.readyCheck : styles.pendingCheck}>
            {status?.webhookReady ? <Check size={16} /> : <Clock3 size={16} />}
            Webhook {status?.webhookReady ? "connected" : "pending"}
          </span>
          <span className={status?.callableTargetCount ? styles.readyCheck : styles.pendingCheck}>
            {status?.callableTargetCount ? <Check size={16} /> : <Clock3 size={16} />}
            {status?.callableTargetCount ?? 0}/3 verified + allowlisted targets
          </span>
          <span className={status?.outboundReady ? styles.readyCheck : styles.pendingCheck}>
            {status?.outboundReady ? <Check size={16} /> : <ShieldCheck size={16} />}
            Outbound {status?.outboundReady ? "enabled" : "safety locked"}
          </span>
          <small>Rechecked every 15 seconds</small>
        </div>

        <blockquote>
          “We have a {patient.age}-year-old with {patient.chiefComplaint}, BP {vitals.systolicMmHg}/{vitals.diastolicMmHg}. Can you accept, do you have the required capability, and what is the estimated offload time?”
        </blockquote>

        <div className={styles.callRows}>
          {callTargets.map((target) => {
            const hospital = result?.hospitals.find((candidate) => candidate.id === target.id)
            const isLiveCall = result?.mode === "live" && hospital?.callPlaced
            const callLabel = loading && !confirming
              ? status?.outboundReady ? "Dialing…" : "Querying agent…"
              : result
                ? isLiveCall ? "Call placed" : result.mode === "demo" ? "Agent replied" : "Not dialed"
                : "Ready"
            return (
              <div key={target.id} className={styles.callRow}>
                <span className={`${styles.callPulse} ${loading && !confirming ? styles.pulsing : ""}`} aria-hidden="true" />
                <strong>{target.name}</strong>
                <span className={styles.callState}>{callLabel}</span>
                <span className={hospital?.accepted ? styles.callAccept : hospital ? styles.callDecline : styles.callPrompt}>
                  {hospital?.accepted ? <Check size={16} /> : hospital ? <CircleX size={16} /> : <Clock3 size={16} />}
                  {hospitalReply(hospital)}
                </span>
              </div>
            )
          })}
        </div>

        <div className={styles.callFootnote}>
          <span><Activity size={15} />{message}</span>
          <small>{status?.outboundReady ? "Only OTP-verified hospital numbers are dialed." : "Until every live-call check passes, scenario agents answer and no external number is dialed."}</small>
        </div>
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

          <p className={`${styles.status} ${coordinationError ? styles.statusError : ""}`} role="status">
            {coordinationError && <CircleAlert size={17} />}{message}
          </p>

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
