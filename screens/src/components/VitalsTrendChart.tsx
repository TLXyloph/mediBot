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
import styles from "./VitalsTrendChart.module.css"

export function VitalsTrendChart({ vitals }: { vitals: VitalReading[] }) {
  if (vitals.length === 0) {
    return (
      <p className={styles.empty}>No vitals yet</p>
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
        <CartesianGrid strokeDasharray="2 8" stroke="#dfd3c3" vertical={false} />
        <XAxis dataKey="time" stroke="#ad9f93" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#786d64" }} />
        <YAxis stroke="#ad9f93" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#786d64" }} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{ background: "#fff9f1", border: "0", borderRadius: 16, boxShadow: "0 12px 32px rgba(53,39,28,.12)" }}
          labelStyle={{ color: "#786d64" }}
          itemStyle={{ color: "#241d18" }}
        />
        <Legend wrapperStyle={{ color: "#786d64", fontSize: 12 }} />
        <Line type="monotone" dataKey="HR" stroke="#241d18" strokeWidth={3} dot={false} />
        <Line type="monotone" dataKey="SpO₂" stroke="#177a4e" strokeWidth={3} dot={false} />
        <Line type="monotone" dataKey="SBP" stroke="#ff4f00" strokeWidth={3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
