"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ClipboardPlus, Hospital, Mic, MonitorUp, PhoneCall, Sparkles } from "lucide-react"

import styles from "./MedCrewHeader.module.css"

export function MedCrewHeader({ status = "Convex live" }: { status?: string }) {
  const pathname = usePathname()
  // Labels are judge-facing and must match the /try clicking guide verbatim.
  const navItems = [
    { href: "/", label: "Medic app", icon: Mic },
    { href: "/medic", label: "Patient record", icon: ClipboardPlus },
    { href: "/hospital", label: "Hospital view", icon: Hospital },
    { href: "/coordinate", label: "Call ahead", icon: PhoneCall },
    { href: "/monitor", label: "Monitor sim", icon: MonitorUp },
    { href: "/try", label: "Try it", icon: Sparkles },
  ]

  return (
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/" aria-label="MedCrew home">
        <Image src="/medcrew-logo.png" width={52} height={52} alt="MedCrew eye and heartbeat logo" priority />
        <span>
          <strong>MedCrew</strong>
          <small>Ambient care coordination</small>
        </span>
      </Link>
      <nav className={styles.actions} aria-label="MedCrew views">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={pathname === href ? "page" : undefined}
            className={pathname === href ? styles.active : undefined}
          >
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        ))}
        <span className={styles.live}><i />{status}</span>
      </nav>
    </header>
  )
}
