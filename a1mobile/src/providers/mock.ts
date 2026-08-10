import type { Environment } from "../env.js";
import type {
  CallStartResult,
  CoordinationCall,
  ProviderWebhookResult,
} from "../types.js";
import type { A1MobileProvider, HandoffMessage } from "./provider.js";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class MockA1MobileProvider implements A1MobileProvider {
  readonly name = "mock" as const;
  readonly handoffs: HandoffMessage[] = [];

  constructor(private readonly environment: Pick<Environment, "a1mobileMockDelayMs">) {}

  async placeCoordinationCall(call: CoordinationCall): Promise<CallStartResult> {
    const indexDelay = call.hospital.id === "ucsf" ? 0 : call.hospital.id === "sf-general" ? 350 : 700;
    await delay(this.environment.a1mobileMockDelayMs + indexDelay);
    const accepted = call.hospital.state.accepting;
    const reason = call.hospital.state.reason;
    const transcript = accepted
      ? `${call.hospital.name} receiving. Yes, we can accept. Estimated offload time is ${call.hospital.state.offloadMinutes} minutes. Required capability is available.`
      : `${call.hospital.name} receiving. We cannot accept due to ${reason ?? "capacity"}.`;

    const response = {
      caseId: call.caseId,
      hospitalId: call.hospital.id,
      hospitalName: call.hospital.name,
      accepted,
      offloadMinutes: call.hospital.state.offloadMinutes,
      capabilities: [...call.hospital.capabilities],
      ...(reason ? { reason } : {}),
      callId: `mock-call-${call.caseId}-${call.hospital.id}`,
      transcript,
      receivedAt: Date.now(),
    };

    return { callId: response.callId, response };
  }

  async sendHandoff(message: HandoffMessage): Promise<void> {
    this.handoffs.push(structuredClone(message));
  }

  parseWebhook(_payload: unknown): ProviderWebhookResult {
    throw new Error("Mock provider does not receive external webhooks");
  }

  verifyWebhook(): boolean {
    return true;
  }
}
