"use client"

import { useEffect, useRef, useState } from "react"
import { TriangleAlert } from "lucide-react"
import type { ConvexEvent } from "@/types/events"
import styles from "./FlagFlash.module.css"

export function FlagFlash({ flags }: { flags: ConvexEvent[] }) {
  const [visible, setVisible] = useState(false)
  const prevCountRef = useRef(0)

  useEffect(() => {
    if (flags.length > prevCountRef.current) {
      setVisible(true)
      const timer = setTimeout(() => setVisible(false), 1500)
      prevCountRef.current = flags.length
      return () => clearTimeout(timer)
    }
    prevCountRef.current = flags.length
  }, [flags.length])

  const latestFlag = flags[flags.length - 1]

  return (
    <>
      {visible && (
        <div className={styles.flash} />
      )}
      {latestFlag && (
        <div className={styles.alert}>
          <TriangleAlert size={23} />
          <div>
            <p className={styles.label}>Safety alert</p>
            <p className={styles.message}>
              {String(latestFlag.payload.message ?? latestFlag.payload.reason ?? latestFlag.payload.text ?? "")}
            </p>
            <time>
              {new Date(latestFlag.ts).toLocaleTimeString()}
            </time>
          </div>
        </div>
      )}
    </>
  )
}
