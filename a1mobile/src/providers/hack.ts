import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Environment } from "../env.js";
import type {
  CallStartResult,
  Capability,
  CoordinationCall,
  ProviderWebhookResult,
} from "../types.js";
import type { A1MobileProvider, HandoffMessage } from "./provider.js";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function callIdFrom(value: unknown): string {
  const raw = record(value);
  return text(raw.call_id ?? raw.callId ?? raw.id ?? raw.call_control_id) ?? `a1-${randomUUID()}`;
}

function acceptedFrom(value: unknown, transcript: string): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "yes", "accepted", "accept"].includes(value.toLowerCase());
  if (/\b(cannot|can't|unable|decline|declined|no|capacity)\b/i.test(transcript)) return false;
  return /\b(accept|accepted|yes|can receive)\b/i.test(transcript);
}

function minutesFrom(value: unknown, transcript: string): number | null {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric);
  const match = transcript.match(
    /(?:offload|wait)(?:\s+time)?(?:\s+is|\s+of|:)?\s+(\d{1,3})\s*(?:min|minute)/i,
  );
  return match?.[1] ? Number(match[1]) : null;
}

function capabilitiesFrom(value: unknown): Capability[] {
  const allowed: Capability[] = ["general", "cardiac", "stroke", "trauma", "pediatric", "burn"];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Capability => typeof item === "string" && allowed.includes(item as Capability),
  );
}

function xml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const replacements: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return replacements[character] ?? character;
  });
}

export interface NumberInfo {
  phoneNumber?: string;
  sipUsername?: string;
  wiringMode?: string;
  webhookUrl?: string;
  raw: JsonRecord;
}

interface PendingCall {
  call: CoordinationCall;
  token: string;
}

export class HackA1MobileProvider implements A1MobileProvider {
  readonly name = "hack" as const;
  private readonly teamKey: string;
  private readonly allowedNumbers: Set<string>;
  private readonly pendingByNumber = new Map<string, PendingCall>();

  constructor(private readonly environment: Environment) {
    if (!environment.a1mobileTeamKey) throw new Error("A1MOBILE_TEAM_KEY is required for hack mode");
    this.teamKey = environment.a1mobileTeamKey;
    this.allowedNumbers = new Set(environment.a1mobileAllowedNumbers);
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.environment.a1mobileApiBaseUrl}${path}`, {
      ...init,
      headers: {
        "X-Team-Key": this.teamKey,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 500);
      throw new Error(`a1mobile request failed (${response.status}): ${details}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (response.status === 204) return {};
    return contentType.includes("application/json") ? response.json() : { value: await response.text() };
  }

  private post(path: string, body?: unknown): Promise<unknown> {
    return this.request(path, {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async claimNumber(): Promise<NumberInfo> {
    return this.normalizeNumberInfo(await this.post("/numbers/claim"));
  }

  async numberInfo(): Promise<NumberInfo> {
    return this.normalizeNumberInfo(await this.request("/numbers/me"));
  }

  async pointNumber(webhookUrl: string): Promise<NumberInfo> {
    if (!/^https:\/\//i.test(webhookUrl)) throw new Error("Voice webhook must be a public HTTPS URL");
    return this.normalizeNumberInfo(await this.post("/numbers/point", { webhook_url: webhookUrl }));
  }

  async unpointNumber(): Promise<NumberInfo> {
    return this.normalizeNumberInfo(await this.post("/numbers/unpoint"));
  }

  async requestNumberVerification(phone: string): Promise<unknown> {
    return this.post("/verified-numbers", { phone });
  }

  async confirmNumberVerification(phone: string, code: string): Promise<unknown> {
    return this.post("/verified-numbers/confirm", { phone, code });
  }

  async setSmsWebhook(webhookUrl: string): Promise<unknown> {
    if (!/^https:\/\//i.test(webhookUrl)) throw new Error("SMS webhook must be a public HTTPS URL");
    return this.post("/sms/webhook", { sms_webhook_url: webhookUrl });
  }

  async inboundSms(sinceId = 0): Promise<unknown> {
    const safeId = Number.isInteger(sinceId) && sinceId >= 0 ? sinceId : 0;
    return this.request(`/sms/inbound?since_id=${safeId}`);
  }

  async sendSms(to: string, body: string, mediaUrls: string[] = []): Promise<unknown> {
    this.assertApprovedDestination(to);
    return this.post("/sms", {
      to,
      body,
      ...(mediaUrls.length ? { media_urls: mediaUrls } : {}),
    });
  }

  async placeCoordinationCall(call: CoordinationCall): Promise<CallStartResult> {
    this.assertApprovedDestination(call.hospital.phone);
    if (!this.environment.a1mobileVoiceWebhookUrl) {
      throw new Error("A1MOBILE_VOICE_WEBHOOK_URL is required before placing calls");
    }
    this.pendingByNumber.set(call.hospital.phone, {
      call: structuredClone(call),
      token: randomUUID(),
    });
    try {
      const result = await this.post("/calls", { to: call.hospital.phone });
      return { callId: callIdFrom(result) };
    } catch (error) {
      this.pendingByNumber.delete(call.hospital.phone);
      throw error;
    }
  }

  async sendHandoff(message: HandoffMessage): Promise<void> {
    await this.sendSms(message.toNumber, message.message);
  }

  pendingCall(toNumber: string): CoordinationCall | undefined {
    const value = this.pendingByNumber.get(toNumber);
    return value ? structuredClone(value.call) : undefined;
  }

  pendingToken(toNumber: string): string | undefined {
    return this.pendingByNumber.get(toNumber)?.token;
  }

  verifyPendingToken(toNumber: string, token: string | undefined): boolean {
    const expected = this.pendingByNumber.get(toNumber)?.token;
    if (!expected || !token || expected.length !== token.length) return false;
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(token, "utf8"));
  }

  finishPendingCall(toNumber: string): void {
    this.pendingByNumber.delete(toNumber);
  }

  initialVoiceTexml(call: CoordinationCall, actionUrl: string): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      `<Gather input="speech" action="${xml(actionUrl)}" method="POST" speechTimeout="auto" timeout="10">`,
      `<Say>${xml(call.prompt)}</Say>`,
      "</Gather>",
      "<Say>We did not receive a response. MedCrew coordination will follow up.</Say>",
      "</Response>",
    ].join("");
  }

  completionVoiceTexml(): string {
    return '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you. Your receiving response has been recorded for the medic.</Say><Hangup/></Response>';
  }

  speechResult(call: CoordinationCall, transcript: string, callId: string): ProviderWebhookResult {
    const accepted = acceptedFrom(undefined, transcript);
    const reason = accepted
      ? undefined
      : /capacity/i.test(transcript)
        ? "Capacity"
        : "Unable to accept";
    return {
      caseId: call.caseId,
      hospitalId: call.hospital.id,
      accepted,
      offloadMinutes: accepted ? minutesFrom(undefined, transcript) : null,
      capabilities: [...call.hospital.capabilities],
      ...(reason ? { reason } : {}),
      callId,
      transcript,
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const received = signature.replace(/^sha256=/i, "").toLowerCase();
    const expected = createHmac("sha256", this.teamKey).update(rawBody).digest("hex");
    if (received.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"));
  }

  parseWebhook(payload: unknown): ProviderWebhookResult {
    const envelope = record(payload);
    const raw = record(envelope.data ?? envelope);
    const metadata = record(raw.metadata ?? envelope.metadata);
    const structured = record(raw.structuredData ?? raw.result ?? raw.output);
    const transcript = text(raw.transcript ?? raw.SpeechResult ?? structured.transcript) ?? "";
    const caseId = text(metadata.caseId ?? structured.caseId);
    const hospitalId = text(metadata.hospitalId ?? structured.hospitalId);
    if (!caseId || !hospitalId) throw new Error("Webhook is missing caseId or hospitalId");
    const accepted = acceptedFrom(structured.accepted ?? raw.accepted, transcript);
    const reason = text(structured.reason ?? raw.reason);
    return {
      caseId,
      hospitalId,
      accepted,
      offloadMinutes: accepted
        ? minutesFrom(structured.offloadMinutes ?? structured.offload_eta ?? raw.offloadMinutes, transcript)
        : null,
      capabilities: capabilitiesFrom(structured.capabilities ?? raw.capabilities),
      ...(reason ? { reason } : {}),
      callId: callIdFrom(raw),
      transcript,
    };
  }

  private assertApprovedDestination(phone: string): void {
    if (!this.environment.a1mobileAllowRealCalls) {
      throw new Error("A1MOBILE_ALLOW_REAL_CALLS=true is required for calls and texts");
    }
    if (!this.allowedNumbers.has(phone)) {
      throw new Error(`Number is not in A1MOBILE_ALLOWED_NUMBERS: ${phone}`);
    }
  }

  private normalizeNumberInfo(value: unknown): NumberInfo {
    const raw = record(value);
    const info: NumberInfo = { raw };
    const phoneNumber = text(raw.phone_number ?? raw.phoneNumber);
    const sipUsername = text(raw.sip_username ?? raw.sipUsername);
    const wiringMode = text(raw.mode ?? raw.wiring_mode ?? raw.wiringMode);
    const webhookUrl = text(raw.webhook_url ?? raw.webhookUrl);
    if (phoneNumber) info.phoneNumber = phoneNumber;
    if (sipUsername) info.sipUsername = sipUsername;
    if (wiringMode) info.wiringMode = wiringMode;
    if (webhookUrl) info.webhookUrl = webhookUrl;
    return info;
  }
}
