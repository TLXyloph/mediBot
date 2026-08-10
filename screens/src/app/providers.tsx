// src/app/providers.tsx
"use client"

import { ConvexProvider, ConvexReactClient } from "convex/react"
import { ReactNode } from "react"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

export function Providers({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <main className="configuration-error">
        <strong>MedCrew needs a Convex deployment URL.</strong>
        <span>Set NEXT_PUBLIC_CONVEX_URL, then rebuild the app.</span>
      </main>
    )
  }
  return <ConvexProvider client={convex}>{children}</ConvexProvider>
}
