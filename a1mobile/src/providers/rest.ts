import { createHmac, timingSafeEqual } from "node:crypto";
import type { Environment } from "../env.js";
import type {
  CallStartResult,
  Capability,
  CoordinationCall,
  ProviderWebhookResult,
} from "../types.js";
import type { A1MobileProvider, HandoffMessage } from "./provider.js";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function callIdFrom(value: unknown): string {
  const raw = record(value);
  return text(raw.callId ?? raw.call_id ?? raw.id) ?? `a1-${crypto.randomUUID()}`;
}

function booleanFrom(value: unknown, transcript: string): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "yes", "accepted", "accept"].includes(value.toLowerCase());
  if (/\b(cannot|can't|unable|decline|no)\b/i.test(transcript)) return false;
  return /\b(accept|accepted|yes)\b/i.test(transcript);
}

function minutesFrom(value: unknown, transcript: string): number | null {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric);
  const match = transcript.match(/(?:offload|wait)(?:\s+time)?(?:\s+is|:)?\s+(\d{1,3})\s*(?:min|minute)/i);
  return match?.[1] ? Number(match[1]) : null;
}

function capabilitiesFrom(value: unknown): Capability[] {
  const allowed: Capability[] = ["general", "cardiac", "stroke", "trauma", "pediatric", "burn"];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Capability => typeof item === "string" && allowed.includes(item as Capability),
  );
}

export class RestA1MobileProvider implements A1MobileProvider {
  readonly name = "rest" as const;
  private readonly apiBaseUrl: string;
  private readonly apiKey: string;
  private readonly agentId: string;
  private readonly webhookSecret: string;
  private readonly allowedNumbers: Set<string>;

  constructor(private readonly environment: Environment) {
    if (!environment.a1mobileAllowRealCalls) {
      throw new Error("A1MOBILE_ALLOW_REAL_CALLS=true is required for the REST provider");
    }
    if (!environment.a1mobileApiBaseUrl || !environment.a1mobileApiKey || !environment.a1mobileAgentId) {
      throw new Error("A1MOBILE_API_BASE_URL, A1MOBILE_API_KEY, and A1MOBILE_AGENT_ID are required");
    }
    if (!environment.a1mobileWebhookSecret) {
      throw new Error("A1MOBILE_WEBHOOK_SECRET is required for the REST provider");
    }
    if (!environment.a1mobileAllowedNumbers.length) {
      throw new Error("A1MOBILE_ALLOWED_NUMBERS must whitelist at least one demo number");
    }
    this.apiBaseUrl = environment.a1mobileApiBaseUrl.replace(/\/$/, "");
    this.apiKey = environment.a1mobileApiKey;
    this.agentId = environment.a1mobileAgentId;
    this.webhookSecret = environment.a1mobileWebhookSecret;
    this.allowedNumbers = new Set(environment.a1mobileAllowedNumbers);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 500);
      throw new Error(`a1mobile request failed (${response.status}): ${details}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    return contentType.includes("application/json") ? response.json() : { id: await response.text() };
  }

  async placeCoordinationCall(call: CoordinationCall): Promise<CallStartResult> {
    if (!this.allowedNumbers.has(call.hospital.phone)) {
      throw new Error(`Hospital number is not in A1MOBILE_ALLOWED_NUMBERS: ${call.hospital.phone}`);
    }

    const result = await this.post(this.environment.a1mobileCallPath, {
      agentId: this.agentId,
      toNumber: call.hospital.phone,
      prompt: call.prompt,
      initialGreeting: call.prompt,
      webhookUrl: call.callbackUrl,
      metadata: { caseId: call.caseId, hospitalId: call.hospital.id },
    });
    return { callId: callIdFrom(result) };
  }

  async sendHandoff(message: HandoffMessage): Promise<void> {
    if (!this.allowedNumbers.has(message.toNumber)) {
      throw new Error(`Hospital number is not in A1MOBILE_ALLOWED_NUMBERS: ${message.toNumber}`);
    }
    await this.post(this.environment.a1mobileMessagePath, {
      agentId: this.agentId,
      toNumber: message.toNumber,
      message: message.message,
      metadata: { caseId: message.caseId, hospitalId: message.hospitalId, kind: "live_sbar" },
    });
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const received = signature.replace(/^sha256=/, "").toLowerCase();
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    if (received.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"));
  }

  parseWebhook(payload: unknown): ProviderWebhookResult {
    const envelope = record(payload);
    const raw = record(envelope.data ?? envelope);
    const metadata = record(raw.metadata ?? envelope.metadata);
    const structured = record(raw.structuredData ?? raw.result ?? raw.output);
    const transcript = text(raw.transcript ?? structured.transcript) ?? "";
    const caseId = text(metadata.caseId ?? structured.caseId);
    const hospitalId = text(metadata.hospitalId ?? structured.hospitalId);
    if (!caseId || !hospitalId) throw new Error("Webhook is missing metadata.caseId or metadata.hospitalId");

    const accepted = booleanFrom(structured.accepted ?? raw.accepted, transcript);
    const offloadMinutes = accepted
      ? minutesFrom(structured.offloadMinutes ?? structured.offload_eta ?? raw.offloadMinutes, transcript)
      : null;
    const reason = text(structured.reason ?? raw.reason);

    return {
      caseId,
      hospitalId,
      accepted,
      offloadMinutes,
      capabilities: capabilitiesFrom(structured.capabilities ?? raw.capabilities),
      ...(reason ? { reason } : {}),
      callId: callIdFrom(raw),
      transcript,
    };
  }
}
