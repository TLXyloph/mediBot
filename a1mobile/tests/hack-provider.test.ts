import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "../src/env.js";
import { DEMO_PATIENT, cloneDemoHospitals } from "../src/hospitals.js";
import { HackA1MobileProvider } from "../src/providers/hack.js";
import { deterministicRequirements } from "../src/requirements.js";
import type { CoordinationCall } from "../src/types.js";

const teamKey = "team-test-secret";
const hospital = cloneDemoHospitals()[0]!;

function environment(overrides: Partial<Environment> = {}): Environment {
  return {
    host: "127.0.0.1",
    port: 4320,
    publicBaseUrl: "https://public.example",
    geminiApiKey: undefined,
    geminiModel: "gemini-3.1-flash",
    geminiMock: true,
    convexUrl: undefined,
    convexAppendFunction: "events:append",
    convexPatientStateFunction: "events:patientState",
    convexSbarFunction: "events:sbar",
    convexMock: true,
    a1mobileProvider: "hack",
    a1mobileApiBaseUrl: "https://hack.a1mobile.com/api",
    a1mobileTeamKey: teamKey,
    a1mobilePhoneNumber: "+14436018773",
    a1mobileSipUsername: "sip-user",
    a1mobileSipPassword: "sip-secret",
    a1mobileVoiceWebhookUrl: "https://public.example/voice",
    a1mobileSmsWebhookUrl: "https://public.example/sms",
    a1mobileAutoPoint: false,
    a1mobileAllowRealCalls: true,
    a1mobileMockDelayMs: 0,
    a1mobileAllowedNumbers: [hospital.phone],
    a1mobileAdminToken: undefined,
    ...overrides,
  };
}

function coordinationCall(): CoordinationCall {
  return {
    caseId: "case-1",
    hospital,
    patient: DEMO_PATIENT,
    requirements: deterministicRequirements(DEMO_PATIENT),
    sbar: "Verified SBAR",
    prompt:
      "We have a chest-pain patient & need cardiac care. Can you accept? Estimated offload time?",
    callbackUrl: "https://public.example/api/a1mobile/webhook",
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("HackA1MobileProvider", () => {
  it("uses the exact X-Team-Key call contract and tracks the pending voice context", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ call_id: "call-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);
    const provider = new HackA1MobileProvider(environment());

    await expect(provider.placeCoordinationCall(coordinationCall())).resolves.toEqual({
      callId: "call-123",
    });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://hack.a1mobile.com/api/calls");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "X-Team-Key": teamKey, "content-type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ to: hospital.phone });
    expect(provider.pendingCall(hospital.phone)?.caseId).toBe("case-1");
    expect(provider.pendingToken(hospital.phone)).toBeTruthy();
  });

  it("creates TeXML and converts the hospital speech result into a ranked response", () => {
    const provider = new HackA1MobileProvider(environment());
    const call = coordinationCall();
    const texml = provider.initialVoiceTexml(
      call,
      "https://public.example/voice/response?to=%2B15550001001&token=abc",
    );
    expect(texml).toContain("<Gather input=\"speech\"");
    expect(texml).toContain("chest-pain patient &amp; need cardiac care");
    expect(texml).toContain("token=abc");

    const result = provider.speechResult(
      call,
      "Yes, we can accept. Estimated offload time is 18 minutes.",
      "call-123",
    );
    expect(result).toMatchObject({
      accepted: true,
      offloadMinutes: 18,
      hospitalId: "ucsf",
      caseId: "case-1",
    });
  });

  it("verifies X-A1-Signature with the team key", () => {
    const provider = new HackA1MobileProvider(environment());
    const body = Buffer.from('{"body":"hospital reply"}');
    const signature = createHmac("sha256", teamKey).update(body).digest("hex");
    expect(provider.verifyWebhook(body, signature)).toBe(true);
    expect(provider.verifyWebhook(body, "0".repeat(64))).toBe(false);
  });

  it("blocks network calls when real calling is not explicitly enabled", async () => {
    const provider = new HackA1MobileProvider(environment({ a1mobileAllowRealCalls: false }));
    await expect(provider.placeCoordinationCall(coordinationCall())).rejects.toThrow(
      "A1MOBILE_ALLOW_REAL_CALLS=true",
    );
  });
});
