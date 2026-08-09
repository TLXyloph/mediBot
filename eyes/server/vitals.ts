import type { PublishResult, VitalEvent, VitalsReading } from "../src/shared/types.js";

export interface EventSink {
  appendVital(event: VitalEvent): Promise<string | undefined>;
}

const LIMITS = {
  hrBpm: [20, 250],
  spo2Pct: [50, 100],
  systolicMmHg: [40, 260],
  diastolicMmHg: [20, 180],
  confidence: [0, 1],
} as const;

function finiteNumber(value: unknown, field: keyof typeof LIMITS): number {
  const number = typeof value === "number" ? value : Number(value);
  const [minimum, maximum] = LIMITS[field];
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new RangeError(`${field} must be between ${minimum} and ${maximum}`);
  }
  return number;
}

export function validateVitals(input: unknown): VitalsReading {
  if (!input || typeof input !== "object") {
    throw new TypeError("Vitals must be an object");
  }

  const candidate = input as Record<string, unknown>;
  const reading: VitalsReading = {
    hrBpm: Math.round(finiteNumber(candidate.hrBpm, "hrBpm")),
    spo2Pct: Math.round(finiteNumber(candidate.spo2Pct, "spo2Pct")),
    systolicMmHg: Math.round(finiteNumber(candidate.systolicMmHg, "systolicMmHg")),
    diastolicMmHg: Math.round(finiteNumber(candidate.diastolicMmHg, "diastolicMmHg")),
    confidence: Number(finiteNumber(candidate.confidence ?? 0.8, "confidence").toFixed(2)),
  };

  if (reading.systolicMmHg <= reading.diastolicMmHg) {
    throw new RangeError("systolicMmHg must be greater than diastolicMmHg");
  }

  return reading;
}

export function vitalFingerprint(reading: VitalsReading): string {
  return [
    reading.hrBpm,
    reading.spo2Pct,
    reading.systolicMmHg,
    reading.diastolicMmHg,
  ].join(":");
}

export function toVitalEvent(reading: VitalsReading, now = Date.now()): VitalEvent {
  return {
    ts: now,
    type: "vital",
    source: "vision",
    role: "medic",
    payload: {
      hrBpm: reading.hrBpm,
      spo2Pct: reading.spo2Pct,
      systolicMmHg: reading.systolicMmHg,
      diastolicMmHg: reading.diastolicMmHg,
    },
    conf: reading.confidence,
    refs: [],
  };
}

export class VitalPublisher {
  private lastPublishedFingerprint?: string;

  constructor(private readonly sink: EventSink) {}

  async publish(input: unknown): Promise<PublishResult> {
    const reading = validateVitals(input);
    const fingerprint = vitalFingerprint(reading);

    if (fingerprint === this.lastPublishedFingerprint) {
      return { accepted: false, duplicate: true };
    }

    const event = toVitalEvent(reading);
    const eventId = await this.sink.appendVital(event);
    this.lastPublishedFingerprint = fingerprint;

    return {
      accepted: true,
      duplicate: false,
      event,
      ...(eventId ? { eventId } : {}),
    };
  }
}
