"use client"

import { useEffect, useRef, useState } from "react"
import { Expand, HeartPulse, Minimize2, TimerReset, Wifi } from "lucide-react"

import { MedCrewHeader } from "@/components/MedCrewHeader"
import styles from "./monitor.module.css"

const scenarios = [
  { hr: 88, spo2: 97, sbp: 118, dbp: 76, label: "STABLE" },
  { hr: 108, spo2: 94, sbp: 90, dbp: 60, label: "HYPOTENSION" },
  { hr: 96, spo2: 95, sbp: 104, dbp: 68, label: "RESPONDING" },
]

export default function MonitorPage() {
  const [index, setIndex] = useState(0)
  const [clock, setClock] = useState("")
  const [fullscreen, setFullscreen] = useState(false)
  const monitorRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const updateClock = () => setClock(new Date().toLocaleTimeString([], { hour12: false }))
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === monitorRef.current)
    updateClock()
    document.addEventListener("fullscreenchange", onFullscreenChange)
    const clockTimer = setInterval(updateClock, 1000)
    const scenarioTimer = setInterval(() => setIndex((value) => (value + 1) % scenarios.length), 15_000)
    return () => {
      clearInterval(clockTimer)
      clearInterval(scenarioTimer)
      document.removeEventListener("fullscreenchange", onFullscreenChange)
    }
  }, [])

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await monitorRef.current?.requestFullscreen()
  }

  const scenario = scenarios[index]

  return (
    <main className={styles.shell}>
      <MedCrewHeader status="Monitor demo" />

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Bedside display</p>
          <h1>Critical values,<br /><em>impossible to miss.</em></h1>
        </div>
        <p>One glance for HR, oxygen, and pressure. The demo scenario advances every 15 seconds.</p>
      </section>

      <section ref={monitorRef} className={styles.monitor} data-alert={scenario.label === "HYPOTENSION"} aria-label="Simulated patient monitor">
        <header className={styles.monitorHead}>
          <span><HeartPulse size={20} />MedCrew monitor</span>
          <div><Wifi size={17} /><span>MB3 · DEMO</span><time>{clock}</time></div>
        </header>

        <div className={styles.values} aria-live="polite">
          <article className={styles.heart}>
            <span>Heart rate</span>
            <strong>{scenario.hr}</strong>
            <small>bpm</small>
          </article>
          <article className={styles.oxygen}>
            <span>Oxygen</span>
            <strong>{scenario.spo2}</strong>
            <small>percent</small>
          </article>
          <article className={styles.pressure}>
            <span>Pressure</span>
            <strong>{scenario.sbp}<i>/</i>{scenario.dbp}</strong>
            <small>mmHg</small>
          </article>
        </div>

        <footer className={styles.monitorFoot}>
          <strong><i />{scenario.label}</strong>
          <span><TimerReset size={16} />Next state in 15 seconds</span>
          <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}>
            {fullscreen ? <Minimize2 size={18} /> : <Expand size={18} />}
            {fullscreen ? "Exit full screen" : "Full screen"}
          </button>
        </footer>
      </section>
    </main>
  )
}
