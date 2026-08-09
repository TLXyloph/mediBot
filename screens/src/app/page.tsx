"use client"

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "convex/react"
import { anyApi } from "convex/server"
import { AudioLines, Eye, Mic, Radio, ScanEye, Square, Video, VideoOff, Wifi } from "lucide-react"

import { MedCrewHeader } from "@/components/MedCrewHeader"
import { answerPatientQuestion, latestVitals } from "@/lib/clinical"
import type { ConvexEvent } from "@/types/events"
import styles from "./page.module.css"

interface RecognitionResultEvent {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>
}

interface RecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: RecognitionResultEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}

type RecognitionConstructor = new () => RecognitionLike

function recognitionConstructor(): RecognitionConstructor | undefined {
  const value = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return value.SpeechRecognition ?? value.webkitSpeechRecognition
}

export default function HomePage() {
  const queriedEvents = useQuery(anyApi.events.timeline, { limit: 250 }) as ConvexEvent[] | undefined
  const events = useMemo(() => queriedEvents ?? [], [queriedEvents])
  const vitals = useMemo(() => latestVitals(events), [events])
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const analyzingRef = useRef(false)
  const [clock, setClock] = useState("--:--:--")
  const [now, setNow] = useState(0)
  const [visionActive, setVisionActive] = useState(false)
  const [visionStatus, setVisionStatus] = useState("Ready to read the monitor")
  const [listening, setListening] = useState(false)
  const [question, setQuestion] = useState("MedCrew, when was the last epi?")
  const [answer, setAnswer] = useState("I’ll check the verified patient state first, then answer out loud.")
  const [showTextQuery, setShowTextQuery] = useState(false)
  const [textQuery, setTextQuery] = useState("")

  useEffect(() => {
    const update = () => {
      const current = new Date()
      setClock(new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(current))
      setNow(current.getTime())
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])

  const speakAnswer = useCallback((rawQuestion: string) => {
    const hasWakeWord = /\b(medcrew|scribe)\b/i.test(rawQuestion)
    setQuestion(rawQuestion)
    if (!hasWakeWord) {
      setAnswer("Say “MedCrew” first so I know the question is for me.")
      return
    }
    const next = answerPatientQuestion(rawQuestion, events)
    setAnswer(next)
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(next))
    }
  }, [events])

  const stopVision = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setVisionActive(false)
    setVisionStatus("Vision paused")
  }, [])

  const scanFrame = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || analyzingRef.current) return
    analyzingRef.current = true
    try {
      const canvas = document.createElement("canvas")
      canvas.width = 960
      canvas.height = Math.round((video.videoHeight / Math.max(video.videoWidth, 1)) * 960) || 540
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
      const response = await fetch("/api/vision/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: canvas.toDataURL("image/jpeg", 0.72) }),
      })
      const result = (await response.json()) as { reading?: unknown; duplicate?: boolean; error?: string }
      if (!response.ok) throw new Error(result.error ?? "Frame analysis failed")
      setVisionStatus(result.reading ? (result.duplicate ? "No meaningful change" : "Vitals recorded to Convex") : "Align all four values in frame")
    } catch (error) {
      setVisionStatus(error instanceof Error ? error.message : "Vision retrying")
    } finally {
      analyzingRef.current = false
    }
  }, [])

  const toggleVision = useCallback(async () => {
    if (streamRef.current) {
      stopVision()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setVisionActive(true)
      setVisionStatus("Reading all four values")
      await scanFrame()
      intervalRef.current = setInterval(scanFrame, 3000)
    } catch (error) {
      setVisionStatus(error instanceof Error ? error.message : "Camera permission is required")
    }
  }, [scanFrame, stopVision])

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const Recognition = recognitionConstructor()
    if (!Recognition) {
      setShowTextQuery(true)
      return
    }
    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = "en-US"
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim()
      if (transcript) speakAnswer(transcript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => {
      setListening(false)
      setShowTextQuery(true)
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const submitTextQuery = (event: FormEvent) => {
    event.preventDefault()
    if (!textQuery.trim()) return
    speakAnswer(textQuery.trim())
    setTextQuery("")
    setShowTextQuery(false)
  }

  const lastEventSeconds = vitals.ts && now ? Math.max(0, Math.round((now - vitals.ts) / 1000)) : null

  return (
    <main className={styles.shell}>
      <MedCrewHeader status={visionActive ? "Gemini vision" : "Convex live"} />
      <div className={styles.workspace}>
        <section aria-labelledby="vision-title">
          <p className={styles.eyebrow}>{visionActive ? "Vision is active" : "Vision is ready"}</p>
          <h1 id="vision-title">Every signal,<br /><em>within sight.</em></h1>
          <p className={styles.lead}>Keep working while MedCrew reads the bedside monitor and records meaningful changes.</p>

          <section className={`${styles.camera} ${visionActive ? styles.cameraActive : ""}`} aria-label="Monitor camera preview">
            <video ref={videoRef} className={styles.video} muted playsInline aria-label="Live monitor camera" />
            <div className={styles.cameraShade} />
            <div className={styles.cameraHead}>
              <span><ScanEye size={19} />Monitor camera</span>
              <span><Wifi size={16} />MB3 · <time>{clock}</time></span>
            </div>
            <div className={styles.cameraFeed}>
              <span className={styles.focusEye}><Eye size={42} strokeWidth={1.7} /></span>
              <strong>{visionStatus}</strong>
              <p>{visionActive ? "Gemini checks a frame every 3 seconds" : "Camera and microphone start only when you choose"}</p>
              <button type="button" className={styles.visionButton} onClick={toggleVision}>
                {visionActive ? <VideoOff size={18} /> : <Video size={18} />}
                {visionActive ? "Stop vision" : "Start monitor vision"}
              </button>
            </div>
            <span className={styles.activity}><i />{lastEventSeconds === null ? "waiting for first event" : `last event ${lastEventSeconds} sec ago`}</span>
          </section>
        </section>

        <aside className={styles.sidePanel} aria-label="Current patient signals">
          <section aria-labelledby="vitals-heading">
            <div className={styles.sideHeading}>
              <h2 id="vitals-heading">Latest vitals</h2>
              <span>Synced to Convex</span>
            </div>
            <div className={styles.vitalStack}>
              <div className={styles.vitalRow}><span>Heart rate</span><strong>{vitals.hrBpm}</strong><small>bpm</small></div>
              <div className={styles.vitalRow}><span>Oxygen</span><strong>{vitals.spo2Pct}</strong><small>percent</small></div>
              <div className={`${styles.vitalRow} ${styles.bp}`}><span>Pressure</span><strong>{vitals.systolicMmHg}/{vitals.diastolicMmHg}</strong><small>mmHg</small></div>
            </div>
          </section>

          <section className={styles.answer} aria-labelledby="answer-heading">
            <div className={styles.answerLabel} id="answer-heading"><AudioLines size={20} />Ready when called</div>
            <blockquote>“{question}”</blockquote>
            <p>{answer}</p>
          </section>

          <div className={styles.commandBar}>
            <div className={styles.commandCopy}>
              <Radio size={23} />
              <div><small>Wake word ready</small><strong>{listening ? "Listening…" : "Ask a patient question"}</strong></div>
            </div>
            <button className={`${styles.micButton} ${listening ? styles.listening : ""}`} onClick={toggleListening} type="button">
              {listening ? <Square size={18} /> : <Mic size={20} />}{listening ? "Stop listening" : "Talk to MedCrew"}
            </button>
          </div>
          {showTextQuery && (
            <form className={styles.textQuery} onSubmit={submitTextQuery}>
              <label htmlFor="text-query">Voice input is unavailable. Type the same question.</label>
              <div><input id="text-query" value={textQuery} onChange={(event) => setTextQuery(event.target.value)} placeholder="MedCrew, what are the latest vitals?" autoFocus /><button type="submit">Ask</button></div>
            </form>
          )}
        </aside>
      </div>
    </main>
  )
}
