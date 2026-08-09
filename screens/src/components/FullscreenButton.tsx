// src/components/FullscreenButton.tsx
"use client"

import { useState } from "react"

export function FullscreenButton() {
  const [isFs, setIsFs] = useState(false)

  const toggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFs(true)
    } else {
      document.exitFullscreen()
      setIsFs(false)
    }
  }

  return (
    <button
      onClick={toggle}
      className="text-sm text-neutral-500 hover:text-white border border-neutral-700 rounded px-3 py-1 transition-colors"
    >
      {isFs ? "Exit Fullscreen" : "Fullscreen"}
    </button>
  )
}
