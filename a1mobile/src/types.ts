export type Capability = "general" | "cardiac" | "stroke" | "trauma" | "pediatric" | "burn";
export type Acuity = "critical" | "emergent" | "urgent";
export type CaseStatus = "preparing" | "calling" | "ranked" | "confirmed" | "failed";

export interface Vitals {
  hrBpm: number;
  spo2Pct: number;
  systolicMmHg: number;
  diastolicMmHg: number;
}

export interface PatientSnapshot {
  age: number;
  sex?: string;
  chiefComplaint: string;
  symptoms: string[];
  medications: string[];
  allergies: string[];
  interventions: string[];
  vitals: Vitals;
  locationLabel?: string;
}

export interface ReceivingRequirements {
  acuity: Acuity;
  capabilities: Capability[];
  reasons: string[];
  clinicalSummary: string;
}

export interface HospitalState {
  accepting: boolean;
  offloadMinutes: number | null;
  reason?: string;
}

export interface Hospital {
  id: string;
  name: string;
  phone: string;
  travelMinutes: number;
  capabilities: Capability[];
  state: HospitalState;
}

export interface CoordinationCall {
  caseId: string;
  hospital: Hospital;
  patient: PatientSnapshot;
  requirements: ReceivingRequirements;
  sbar: string;
  prompt: string;
  callbackUrl: string;
}

export interface HospitalResponse {
  caseId: string;
  hospitalId: string;
  hospitalName: string;
  accepted: boolean;
  offloadMinutes: number | null;
  capabilities: Capability[];
  reason?: string;
  callId: string;
  transcript: string;
  receivedAt: number;
}

export interface CallStartResult {
  callId: string;
  response?: HospitalResponse;
}

export interface RankingEntry {
  hospitalId: string;
  hospitalName: string;
  eligible: boolean;
  travelMinutes: number;
  offloadMinutes: number | null;
  missingCapabilities: Capability[];
  score: number | null;
}

export interface CoordinationCase {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: CaseStatus;
  patient: PatientSnapshot;
  requirements: ReceivingRequirements;
  sbar: string;
  hospitals: Hospital[];
  callIds: Record<string, string>;
  responses: HospitalResponse[];
  ranking: RankingEntry[];
  recommendedHospitalId: string | null;
  confirmedHospitalId: string | null;
  error?: string;
}

export interface AppendOnlyEvent {
  ts: number;
  type: "sbar_update";
  source: "agent" | "system";
  role: "medic";
  payload: Record<string, unknown>;
  conf: number;
  refs: string[];
}

export interface ProviderWebhookResult {
  caseId: string;
  hospitalId: string;
  accepted: boolean;
  offloadMinutes: number | null;
  capabilities: Capability[];
  reason?: string;
  callId: string;
  transcript: string;
}
