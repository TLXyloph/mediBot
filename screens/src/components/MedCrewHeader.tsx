import Image from "next/image"
import Link from "next/link"
import { ClipboardPlus, Hospital, MonitorUp } from "lucide-react"

import styles from "./MedCrewHeader.module.css"

export function MedCrewHeader({ status = "Convex live" }: { status?: string }) {
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
        <Link href="/medic" aria-label="Patient record"><ClipboardPlus size={18} /><span>Patient record</span></Link>
        <Link href="/coordinate" aria-label="Coordinate hospitals"><Hospital size={18} /><span>Coordinate</span></Link>
        <Link href="/monitor" aria-label="Open monitor"><MonitorUp size={18} /><span>Monitor</span></Link>
        <span className={styles.live}><i />{status}</span>
      </nav>
    </header>
  )
}
