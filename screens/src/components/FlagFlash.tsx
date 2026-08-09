"use client"

import { useEffect, useRef, useState } from "react"
import type { ConvexEvent } from "@/types/events"

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
      {/* Full-screen red overlay */}
      {visible && (
        <div className="fixed inset-0 bg-red-600/40 pointer-events-none z-40 animate-pulse" />
      )}
      {/* Persistent flag banner (shows latest flag, stays until cleared) */}
      {latestFlag && (
        <div className="bg-red-900 border border-red-600 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-400 text-2xl">⚠</span>
          <div>
            <p className="text-sm font-bold uppercase text-red-400 tracking-widest mb-1">Safety Alert</p>
            <p className="text-xl text-white">
              {String(latestFlag.payload.message ?? latestFlag.payload.text ?? "")}
            </p>
            <p className="text-sm text-red-400 mt-1">
              {new Date(latestFlag.ts).toLocaleTimeString()}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
