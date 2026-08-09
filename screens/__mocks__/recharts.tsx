import React from "react"

// Mock recharts components so they render real HTML/SVG in jsdom tests
export const ResponsiveContainer = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 500, height: 300 }}>{children}</div>
)

export const LineChart = ({ children }: { children: React.ReactNode }) => (
  <svg>{children}</svg>
)

export const Line = () => null
export const XAxis = () => null
export const YAxis = () => null
export const CartesianGrid = () => null
export const Tooltip = () => null
export const Legend = () => null
