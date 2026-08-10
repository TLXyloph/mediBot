export type EyesMode = "idle" | "connecting" | "live" | "fallback" | "stopped" | "error";

export interface VitalsReading {
  hrBpm: number;
  spo2Pct: number;
  systolicMmHg: number;
  diastolicMmHg: number;
  confidence: number;
}

export interface VitalEvent {
  ts: number;
  type: "vital";
  source: "vision";
  role: "medic";
  // Contract shape (brain/README.md): one event per vital.
  // name ∈ hr | spo2 | sbp | dbp — screens/ merges same-ts events into a reading.
  payload: {
    name: string;
    value: number;
  };
  conf: number;
  refs: string[];
}

export interface PatientState {
  medications: string[];
  allergies: string[];
  lastEpinephrineAt: number | null;
  protocolPosition: string | null;
}

export interface PublishResult {
  accepted: boolean;
  duplicate: boolean;
  eventId?: string;
  event?: VitalEvent;
  events?: VitalEvent[];
}

export interface HealthResponse {
  ok: boolean;
  geminiConfigured: boolean;
  convexConfigured: boolean;
  convexMode: "live" | "mock" | "missing";
  liveModel: string;
  visionModel: string;
}

export interface LiveTokenResponse {
  token: string;
  model: string;
  expiresAt: string;
}

export interface FallbackAnalysisResponse {
  detected: boolean;
  reading?: VitalsReading;
  publish?: PublishResult;
}
