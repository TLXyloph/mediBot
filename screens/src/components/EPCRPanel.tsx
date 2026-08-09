// src/components/EPCRPanel.tsx
"use client"

import type { EPCRData, VitalReading } from "@/lib/derive"

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
    <div
      data-field={label}
      data-event-id={eventId ?? ""}
      className={`bg-neutral-900 rounded p-3 flex flex-col gap-1 ${
        eventId && onClick ? "cursor-pointer hover:bg-neutral-800 transition-colors" : ""
      }`}
      onClick={() => eventId && onClick?.(eventId)}
    >
      <span className="text-xs uppercase tracking-widest text-neutral-500">{label}</span>
      <span className="text-2xl font-semibold truncate">{value || "—"}</span>
    </div>
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <div className="col-span-2 md:col-span-3">
        <Field
          label="Chief Complaint"
          value={epcr.chiefComplaint}
          eventId={
            epcr.allEvents.find((e) => e.type === "symptom" && e.payload.text)?._id
          }
          onClick={onFieldClick}
        />
      </div>
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
      <Field label="HR" value={hr.val ? `${hr.val} bpm` : ""} eventId={hr.id} onClick={onFieldClick} />
      <Field label="SpO₂" value={spo2.val ? `${spo2.val}%` : ""} eventId={spo2.id} onClick={onFieldClick} />
      <Field label="BP" value={bpVal ? `${bpVal} mmHg` : ""} eventId={sbp.id} onClick={onFieldClick} />
      <Field label="Medications" value={medNames} eventId={epcr.medications[0]?._id} onClick={onFieldClick} />
      <Field label="Interventions" value={intNames} eventId={epcr.interventions[0]?._id} onClick={onFieldClick} />
    </div>
  )
}
