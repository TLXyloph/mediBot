"use client"

// Lane A's ambient transcription, running entirely in the deployed browser:
// continuous Gemini Live ASR → hardened command grammar → append-only Convex
// events, with spoken answers AND spoken flag/timer alerts (SpeechSynthesis).
// While active this page is a complete standalone MediBot — demo insurance if
// the MB1 local stack dies. Run EITHER this OR MB1's local ears as the ambient
// data plane, never both (they would double-chart the same speech).

import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { anyApi } from "convex/server"
import { Mic, Square } from "lucide-react"
import type { ConvexEvent } from "@/types/events"
import { answerFromPatientState, type PatientStateSummary } from "@/lib/clinical"
import { BrowserEars } from "@/lib/ears/liveEars"
import { TranscriptSegmenter } from "@/lib/ears/segmenter"
import { parseCommand, extractEmbedded, isPlumbingPhrase, type Command } from "@/lib/ears/grammar"

const WAKE_HANGOVER_MS = 4000
const CROSS_PATH_WINDOW_MS = 12_000
const fpNorm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim()

export function AmbientScribe() {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState("Ambient scribe idle")
  const [lastLine, setLastLine] = useState("")

  const append = useMutation(anyApi.events.append)
  const events = (useQuery(anyApi.events.timeline, { limit: 250 }) as ConvexEvent[] | undefined) ?? []
  const patient = useQuery(anyApi.patientState.patientState) as PatientStateSummary | undefined

  const earsRef = useRef<BrowserEars | null>(null)
  const segmenterRef = useRef<TranscriptSegmenter | null>(null)
  const pendingWakeUntil = useRef(0)
  const recentCommands = useRef(new Map<string, number>())
  const speakingCount = useRef(0)
  const startedAt = useRef(0)
  const spokenAlerts = useRef(new Set<string>())
  const latest = useRef({ events, patient })
  latest.current = { events, patient }

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onstart = () => {
      speakingCount.current += 1
      if (earsRef.current) earsRef.current.muted = true
    }
    const release = () => {
      speakingCount.current = Math.max(0, speakingCount.current - 1)
      if (speakingCount.current === 0 && earsRef.current) earsRef.current.muted = false
    }
    utterance.onend = release
    utterance.onerror = release
    window.speechSynthesis.speak(utterance)
  }, [])

  const emit = useCallback(
    (cmd: Command | null, raw: string, speaker?: string) => {
      const base = { ts: Date.now(), source: "voice" as const, conf: 1, refs: [] as string[] }
      if (!cmd) {
        void append({ ...base, type: "utterance", payload: { text: raw, ...(speaker ? { speaker } : {}) } })
        setLastLine(`utterance — "${raw.slice(0, 60)}"`)
        return
      }
      if (cmd.kind === "correction") {
        void append({ ...base, type: "correction", role: "medic", payload: { text: cmd.text, raw } })
        setLastLine(`correction — "${cmd.text}"`)
      } else if (cmd.kind === "mark") {
        void append({ ...base, type: "intervention", role: "medic", payload: { text: cmd.text, mark: true, raw } })
        setLastLine(`mark — "${cmd.text}"`)
      } else if (cmd.kind === "question") {
        // payload.question is the scribe-skip tag (anti-phantom guarantee).
        void append({ ...base, type: "utterance", role: "medic", payload: { text: raw, question: cmd.text } })
        const answer = answerFromPatientState(cmd.text, latest.current.patient, latest.current.events)
        setLastLine(`question — "${cmd.text}"`)
        speak(answer)
      }
    },
    [append, speak],
  )

  const handleUtterance = useCallback(
    (text: string, speaker?: string) => {
      const trimmed = text.replace(/\s+/g, " ").trim()
      if (!trimmed || isPlumbingPhrase(trimmed)) return

      const assumeWake = Date.now() < pendingWakeUntil.current
      pendingWakeUntil.current = 0
      let cmd = parseCommand(trimmed, { assumeWake })

      if (cmd?.kind === "wake") {
        pendingWakeUntil.current = Date.now() + WAKE_HANGOVER_MS
        setStatus("Wake word heard — listening for the command…")
        return
      }
      if (cmd) {
        const fp = `${cmd.kind}|${fpNorm(cmd.text)}`
        const last = recentCommands.current.get(fp) ?? 0
        if (Date.now() - last < CROSS_PATH_WINDOW_MS) return
        recentCommands.current.set(fp, Date.now())
        emit(cmd, trimmed, speaker)
        return
      }
      const embedded = extractEmbedded(trimmed)
      if (embedded) {
        emit(null, embedded.head, speaker)
        emit(embedded.cmd, embedded.tail, speaker)
        return
      }
      emit(null, trimmed, speaker)
    },
    [emit],
  )

  const start = useCallback(async () => {
    if (running) return
    startedAt.current = Date.now()
    const segmenter = new TranscriptSegmenter((text, meta) => handleUtterance(text, meta.speaker), 1500)
    segmenterRef.current = segmenter
    const ears = new BrowserEars({
      onTranscriptChunk: (chunk, meta) => segmenter.push(chunk, meta),
      onBoundary: () => segmenter.boundary(),
      onStatus: setStatus,
    })
    earsRef.current = ears
    try {
      await ears.start()
      setRunning(true)
    } catch (error) {
      setStatus(`Could not start: ${error instanceof Error ? error.message : "unknown error"}`)
      ears.stop()
      earsRef.current = null
    }
  }, [running, handleUtterance])

  const stop = useCallback(() => {
    earsRef.current?.stop()
    earsRef.current = null
    segmenterRef.current?.dispose()
    segmenterRef.current = null
    setRunning(false)
    setStatus("Ambient scribe idle")
  }, [])

  useEffect(() => stop, [stop])

  // Spoken flag/timer alerts while active — the deployed app's alert channel.
  useEffect(() => {
    if (!running) return
    for (const event of events) {
      if (event.type !== "flag" && event.type !== "timer") continue
      if (event.ts < startedAt.current) continue
      const id = String((event as { _id?: string })._id ?? `${event.ts}:${event.type}`)
      if (spokenAlerts.current.has(id)) continue
      spokenAlerts.current.add(id)
      const p = event.payload as Record<string, unknown>
      const text =
        [p.say, p.text, p.message, p.label].find((v) => typeof v === "string" && v) ??
        (event.type === "timer" ? "Protocol timer due." : "Safety flag raised.")
      speak(String(text))
    }
  }, [events, running, speak])

  return (
    <section
      aria-label="Ambient scribe"
      style={{
        marginTop: "1rem",
        padding: "0.85rem 1rem",
        background: "var(--sand)",
        borderLeft: "3px solid var(--orange)",
        display: "grid",
        gap: "0.4rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={running ? stop : start}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: running ? "var(--ink)" : "var(--orange)",
            color: "#fff",
            border: 0,
            borderRadius: "999px",
            padding: "0.55rem 1.15rem",
            font: "inherit",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {running ? <Square size={16} /> : <Mic size={18} />}
          {running ? "Stop ambient scribe" : "Start ambient scribe"}
        </button>
        <small style={{ color: "var(--muted)" }}>{status}</small>
      </div>
      {lastLine ? <small style={{ color: "var(--ink)" }}>Last: {lastLine}</small> : null}
      <small style={{ color: "var(--muted)" }}>
        Continuous charting — leave it on and just talk. Say “Scribe” or “MedCrew” for commands
        (“Scribe, mark epi given” · “MedCrew, when was the last epi?”).
      </small>
    </section>
  )
}
