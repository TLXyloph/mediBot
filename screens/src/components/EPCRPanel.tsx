// src/components/EPCRPanel.tsx
"use client"

import type { EPCRData, VitalReading } from "@/lib/derive"
import styles from "./EPCRPanel.module.css"

function Field({
  label,
  value,
  eventId,
  onClick,
}: {
  label: string
  value: string
  eventId?: string
  onClick?: (eventId: string) => void
}) {
  return (
    <button
      type="button"
      data-field={label}
      data-event-id={eventId ?? ""}
      className={`${styles.field} ${eventId && onClick ? styles.clickable : ""}`}
      onClick={() => eventId && onClick?.(eventId)}
      disabled={!eventId || !onClick}
    >
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </button>
  )
}

function latestVital(vitals: VitalReading[], key: keyof VitalReading): { val: string; id?: string } {
  if (!vitals.length) return { val: "" }
  const last = vitals[vitals.length - 1]
  const raw = last[key]
  return {
    val: raw != null ? String(raw) : "",
    id: last.sourceEvent._id,
  }
}

export function EPCRPanel({
  epcr,
  onFieldClick,
}: {
  epcr: EPCRData
  onFieldClick?: (eventId: string) => void
}) {
  const hr = latestVital(epcr.vitals, "hr")
  const spo2 = latestVital(epcr.vitals, "spo2")
  const sbp = latestVital(epcr.vitals, "sbp")
  const dbp = latestVital(epcr.vitals, "dbp")
  const bpVal = sbp.val && dbp.val ? `${sbp.val}/${dbp.val}` : sbp.val || ""

  const medNames = epcr.medications
    .map((e) => String(e.payload.name ?? e.payload.text ?? ""))
    .filter(Boolean)
    .join(", ")

  const intNames = epcr.interventions
    .map((e) => String(e.payload.name ?? e.payload.text ?? ""))
    .filter(Boolean)
    .join(", ")

  return (
    <div className={styles.panel}>
      <div className={styles.primary}>
        <Field
          label="Chief Complaint"
          value={epcr.chiefComplaint}
          eventId={
            epcr.allEvents.find((e) => e.type === "symptom" && e.payload.text)?._id
          }
          onClick={onFieldClick}
        />
      </div>
      <div className={styles.vitals}>
        <Field
          label="Age"
          value={epcr.age}
          eventId={
            epcr.allEvents.find(
              (e) => (e.type === "utterance" || e.type === "symptom") && e.payload.age != null
            )?._id
          }
          onClick={onFieldClick}
        />
        <Field label="Heart rate" value={hr.val ? `${hr.val} bpm` : ""} eventId={hr.id} onClick={onFieldClick} />
        <Field label="Oxygen" value={spo2.val ? `${spo2.val}%` : ""} eventId={spo2.id} onClick={onFieldClick} />
        <Field label="Pressure" value={bpVal ? `${bpVal} mmHg` : ""} eventId={sbp.id} onClick={onFieldClick} />
      </div>
      <div className={styles.care}>
        <Field label="Medications" value={medNames} eventId={epcr.medications[0]?._id} onClick={onFieldClick} />
        <Field label="Interventions" value={intNames} eventId={epcr.interventions[0]?._id} onClick={onFieldClick} />
      </div>
    </div>
  )
}
