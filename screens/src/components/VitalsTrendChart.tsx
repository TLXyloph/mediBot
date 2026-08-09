"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import type { VitalReading } from "@/lib/derive"

export function VitalsTrendChart({ vitals }: { vitals: VitalReading[] }) {
  if (vitals.length === 0) {
    return (
      <p className="text-neutral-500 text-lg text-center py-8">No vitals yet</p>
    )
  }

  const data = vitals.map((v) => ({
    time: new Date(v.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    HR: v.hr,
    "SpO₂": v.spo2,
    SBP: v.sbp,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis dataKey="time" stroke="#9ca3af" tick={{ fontSize: 12 }} />
        <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ background: "#171717", border: "1px solid #333", borderRadius: 8 }}
          labelStyle={{ color: "#9ca3af" }}
          itemStyle={{ color: "#e5e7eb" }}
        />
        <Legend wrapperStyle={{ color: "#e5e7eb", fontSize: 14 }} />
        <Line type="monotone" dataKey="HR" stroke="#f87171" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="SpO₂" stroke="#60a5fa" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="SBP" stroke="#4ade80" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
