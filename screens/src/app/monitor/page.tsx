"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Expand, HeartPulse, Wifi } from "lucide-react"

import styles from "./monitor.module.css"

const scenarios = [
  { hr: 88, spo2: 97, sbp: 118, dbp: 76, label: "STABLE" },
  { hr: 108, spo2: 94, sbp: 90, dbp: 60, label: "HYPOTENSION" },
  { hr: 96, spo2: 95, sbp: 104, dbp: 68, label: "RESPONDING" },
]

export default function MonitorPage() {
  const [index, setIndex] = useState(0)
  const [clock, setClock] = useState("")
  useEffect(() => {
    const updateClock = () => setClock(new Date().toLocaleTimeString([], { hour12: false }))
    updateClock()
    const clockTimer = setInterval(updateClock, 1000)
    const scenarioTimer = setInterval(() => setIndex((value) => (value + 1) % scenarios.length), 15_000)
    return () => { clearInterval(clockTimer); clearInterval(scenarioTimer) }
  }, [])
  const scenario = scenarios[index]

  return (
    <main className={styles.shell} data-alert={scenario.label === "HYPOTENSION"}>
      <header>
        <Link href="/"><HeartPulse size={23} />MEDCREW <span>SIMULATED PATIENT MONITOR</span></Link>
        <div><Wifi size={19} /><span>LIVE · DEMO ONLY</span><button type="button" onClick={() => document.documentElement.requestFullscreen()} aria-label="Enter full screen"><Expand size={19} /></button></div>
      </header>
      <section className={styles.grid} aria-live="polite">
        <article className={styles.heart}><p>HR <small>bpm</small></p><strong>{scenario.hr}</strong></article>
        <article className={styles.oxygen}><p>SpO₂ <small>%</small></p><strong>{scenario.spo2}</strong></article>
        <article className={styles.pressure}><p>NIBP <small>mmHg</small></p><strong>{scenario.sbp}<i>/</i>{scenario.dbp}</strong></article>
      </section>
      <footer><strong>{scenario.label}</strong><span>Scenario changes every 15 seconds</span><time>{clock}</time></footer>
    </main>
  )
}
