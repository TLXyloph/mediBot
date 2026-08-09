// Synced from voice/src/segmenter.ts (lane A's battle-tested segmenter).
// Turns incremental Live-transcription chunks into utterances. Flush on the
// server `finished` flag, turnComplete boundary, speaker change, or idle gap.

export interface SegmentMeta {
  speaker?: string
}

export class TranscriptSegmenter {
  private buf = ""
  private speaker: string | undefined
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private onUtterance: (text: string, meta: SegmentMeta) => void,
    private idleMs = 1500,
  ) {}

  push(chunk: string, opts: { speaker?: string; finished?: boolean } = {}): void {
    if (opts.speaker && this.speaker && opts.speaker !== this.speaker) this.flush()
    if (opts.speaker) this.speaker = opts.speaker
    this.buf += chunk
    this.resetTimer()
    if (opts.finished) this.flush()
  }

  boundary(): void {
    this.flush()
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), this.idleMs)
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const text = this.buf.replace(/\s+/g, " ").trim()
    this.buf = ""
    if (text.length >= 2) this.onUtterance(text, { speaker: this.speaker })
  }
}
