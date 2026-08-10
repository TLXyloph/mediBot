import Link from "next/link"
import { MedCrewHeader } from "@/components/MedCrewHeader"

// Judge-facing guided tour: three 60-second experiments against the SAME live
// system the pitch just demoed. Static content — all interaction happens on
// the linked live routes.

export const metadata = { title: "Try MedCrew yourself" }

const step: React.CSSProperties = {
  borderLeft: "3px solid var(--orange)",
  padding: "0.7rem 1rem",
  margin: "1rem 0",
  background: "var(--sand)",
}

export default function TryPage() {
  return (
    <main style={{ maxWidth: "42rem", margin: "0 auto", padding: "1.5rem 1.25rem 4rem", color: "var(--ink)" }}>
      <MedCrewHeader status="Live — same system you just watched" />
      <h1 style={{ fontSize: "1.9rem", lineHeight: 1.15, margin: "1.2rem 0 0.4rem" }}>
        Try the ambulance's AI crew member yourself
      </h1>
      <p style={{ color: "var(--muted)", margin: 0 }}>
        This is not a mock — you are operating the same live append-only record from the demo.
        Three experiments, about a minute each. Use a quiet-ish corner, or type instead of speaking.
      </p>

      <section style={step}>
        <strong>1 · Chart by talking</strong>
        <p style={{ margin: "0.4rem 0" }}>
          Open the <Link href="/">medic app</Link>, allow the microphone, and just say what a
          paramedic would say — for example: <em>"the patient is dizzy and takes warfarin."</em>{" "}
          Watch the <Link href="/medic">record</Link> chart it in seconds, attributed to the patient.
          Loud room? The typed box runs the identical pipeline.
        </p>
      </section>

      <section style={step}>
        <strong>2 · Trip the safety net</strong>
        <p style={{ margin: "0.4rem 0" }}>
          After step 1, say: <em>"giving ketorolac."</em> The safety agent checks it against the
          documented warfarin and raises a bleeding-risk flag — watch the{" "}
          <Link href="/hospital">receiving-hospital screen</Link> flash. (Each drug pair flags once
          per record — if someone beat you to ketorolac, try <em>naproxen</em> or{" "}
          <em>clopidogrel</em>.)
        </p>
      </section>

      <section style={step}>
        <strong>3 · Ask it anything about the patient</strong>
        <p style={{ margin: "0.4rem 0" }}>
          Say or type: <em>"MedCrew, what are the latest vitals?"</em> or{" "}
          <em>"MedCrew, what medications is the patient on?"</em> Answers come from the verified
          event log — including whatever you just charted — and never invent data.
        </p>
      </section>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Under the hood: ambient speech → Gemini transcription → append-only Convex events →
        extraction, safety, gap, SBAR and protocol agents → live medic and hospital views, with
        A1mobile calling receiving hospitals before the ambulance moves. Every field traces back to
        the words that created it. Also live here: the <Link href="/monitor">bedside monitor</Link>{" "}
        our vision watches.
      </p>
    </main>
  )
}
