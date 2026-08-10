// src/app/layout.tsx
import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: { default: "MedCrew", template: "%s · MedCrew" },
  description: "Ambient vision, verified patient state, and hospital coordination for EMS crews.",
  applicationName: "MedCrew",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
