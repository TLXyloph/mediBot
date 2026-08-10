import type {
  CallStartResult,
  CoordinationCall,
  HospitalResponse,
  ProviderWebhookResult,
} from "../types.js";

export interface HandoffMessage {
  caseId: string;
  hospitalId: string;
  toNumber: string;
  message: string;
}

export interface A1MobileProvider {
  readonly name: "mock" | "hack";
  placeCoordinationCall(call: CoordinationCall): Promise<CallStartResult>;
  sendHandoff(message: HandoffMessage): Promise<void>;
  parseWebhook(payload: unknown): ProviderWebhookResult;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
}

export function responseTranscript(response: HospitalResponse): string {
  if (!response.accepted) return `${response.hospitalName}: unable to accept. ${response.reason ?? "Unavailable"}.`;
  return `${response.hospitalName}: accepted. Estimated offload ${response.offloadMinutes ?? "unknown"} minutes. Capabilities confirmed: ${response.capabilities.join(", ")}.`;
}
