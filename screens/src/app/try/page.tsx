import Link from "next/link"
import { MedCrewHeader } from "@/components/MedCrewHeader"

// Judge-facing clicking guide. Every bolded name below matches a top-bar nav
// label or an on-page button VERBATIM — if you rename one, rename it here too.

export const metadata = { title: "Try MedCrew yourself" }

const step: React.CSSProperties = {
  borderLeft: "3px solid var(--orange)",
  padding: "0.75rem 1rem",
  margin: "1rem 0",
  background: "var(--sand)",
}
const chip: React.CSSProperties = {
  display: "inline-block",
  background: "var(--orange)",
  color: "#fff",
  borderRadius: "999px",
  padding: "0.1rem 0.6rem",
  fontSize: "0.8rem",
  fontWeight: 700,
  marginRight: "0.5rem",
}

export default function TryPage() {
  return (
    <main style={{ maxWidth: "42rem", margin: "0 auto", padding: "1.5rem 1.25rem 4rem", color: "var(--ink)" }}>
      <MedCrewHeader status="Live — same system you just watched" />
      <h1 style={{ fontSize: "1.9rem", lineHeight: 1.15, margin: "1.2rem 0 0.4rem" }}>
        Operate the ambulance's AI crew member
      </h1>
      <p style={{ color: "var(--muted)", margin: 0 }}>
        Not a mock — you are writing to the same live patient record from the demo. Three
        experiments, about a minute each. Everything you need is in the top bar.
      </p>

      <section style={step}>
        <div><span style={chip}>1</span><strong>Chart by talking</strong></div>
        <p style={{ margin: "0.45rem 0" }}>
          Top bar → <strong>Medic app</strong>. Press the orange <strong>Start ambient scribe</strong>{" "}
          button and allow the microphone. Then just say, like a paramedic would:{" "}
          <em>"the patient is dizzy and takes warfarin."</em>
        </p>
        <p style={{ margin: "0.45rem 0" }}>
          Top bar → <strong>Patient record</strong>: your words are already charted — symptom and
          medication extracted, attributed, timestamped. Loud room? On <strong>Medic app</strong>,
          press <strong>Talk to MedCrew</strong> and use the typed box — identical pipeline.
        </p>
      </section>

      <section style={step}>
        <div><span style={chip}>2</span><strong>Trip the safety net</strong></div>
        <p style={{ margin: "0.45rem 0" }}>
          Still on <strong>Medic app</strong> with the scribe running, say:{" "}
          <em>"giving ketorolac."</em> Then top bar → <strong>Hospital view</strong> — the screen
          flashes red: bleeding-risk conflict with the warfarin <em>you</em> documented. (Each drug
          pair flags once per record — if ketorolac's been used, try <em>naproxen</em> or{" "}
          <em>clopidogrel</em>.)
        </p>
      </section>

      <section style={step}>
        <div><span style={chip}>3</span><strong>Interrogate the record</strong></div>
        <p style={{ margin: "0.45rem 0" }}>
          On <strong>Medic app</strong>, ask out loud: <em>"MedCrew, what are the latest vitals?"</em>{" "}
          or <em>"MedCrew, what medications is the patient on?"</em> — it answers from the verified
          event log, including what you just charted, and questions never create phantom chart
          entries.
        </p>
      </section>

      <section style={step}>
        <div><span style={chip}>+</span><strong>Have VoiceOS? Install MediBot as a VoiceOS app</strong></div>
        <p style={{ margin: "0.45rem 0" }}>
          MediBot ships as a native VoiceOS integration. On your Mac:{" "}
          <code>git clone https://github.com/TLXyloph/mediBot</code>, then VoiceOS →{" "}
          <strong>Apps</strong> → <strong>Install from folder</strong> →{" "}
          <code>voice/voiceos-integration</code>. Push-to-talk and say:{" "}
          <em>"correction — BP 90 over 60"</em> → VoiceOS answers <em>"Logged."</em> and it lands on
          this record. Then ask: <em>"when was the last epi?"</em> — your VoiceOS speaks the answer
          straight from the live patient state.
        </p>
        <p style={{ margin: "0.45rem 0", color: "var(--muted)", fontSize: "0.9rem" }}>
          No extra macOS permissions needed — it's a plain MCP integration (no keyboard or screen
          access). No install button in your build? Ask the VoiceOS crew here — it's their feature
          flag. If the tool errors on launch, set the manifest's <code>command</code> to your
          absolute bun or node path.
        </p>
      </section>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Also in the top bar: <strong>Monitor sim</strong> — the bedside monitor our camera vision
        reads vitals from — and <strong>Call ahead</strong>, the A1mobile console that phones
        receiving hospitals before the ambulance moves. Under the hood: speech → Gemini →
        append-only Convex events → extraction, safety, gap, SBAR and protocol agents → every field
        traceable to the words that created it.
      </p>
    </main>
  )
}
