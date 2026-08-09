// src/components/FullscreenButton.tsx
"use client"

import { useState } from "react"
import { Expand, Minimize2 } from "lucide-react"
import styles from "./FullscreenButton.module.css"

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
      className={styles.button}
      type="button"
    >
      {isFs ? <Minimize2 size={17} /> : <Expand size={17} />}
      {isFs ? "Exit Fullscreen" : "Fullscreen"}
    </button>
  )
}
