import { describe, expect, it } from "vitest";
import type { Environment } from "../src/env.js";
import { HospitalCoordinator } from "../src/coordinator.js";
import { DEMO_PATIENT, cloneDemoHospitals } from "../src/hospitals.js";
import { MockA1MobileProvider } from "../src/providers/mock.js";
import { deterministicRequirements, type RequirementsEngine } from "../src/requirements.js";
import type { AppendOnlyEvent, PatientSnapshot } from "../src/types.js";
import type { CoordinationEventSink } from "../src/convex.js";

const environment: Environment = {
  host: "127.0.0.1",
  port: 4320,
  publicBaseUrl: "http://localhost:4320",
  geminiApiKey: undefined,
  geminiModel: "gemini-3.1-flash",
  geminiMock: true,
  convexUrl: undefined,
  convexAppendFunction: "events:append",
  convexPatientStateFunction: "events:patientState",
  convexSbarFunction: "events:sbar",
  convexMock: true,
  a1mobileProvider: "mock",
  a1mobileApiBaseUrl: "https://hack.a1mobile.com/api",
  a1mobileTeamKey: undefined,
  a1mobilePhoneNumber: undefined,
  a1mobileSipUsername: undefined,
  a1mobileSipPassword: undefined,
  a1mobileVoiceWebhookUrl: undefined,
  a1mobileSmsWebhookUrl: undefined,
  a1mobileAutoPoint: false,
  a1mobileAllowRealCalls: false,
  a1mobileMockDelayMs: 0,
  a1mobileAllowedNumbers: [],
  a1mobileAdminToken: undefined,
};

class MemoryEvents implements CoordinationEventSink {
  readonly mode = "mock" as const;
  readonly values: AppendOnlyEvent[] = [];

  async append(event: AppendOnlyEvent): Promise<string> {
    this.values.push(event);
    return `event-${this.values.length}`;
  }

  async patientContext(): Promise<Partial<PatientSnapshot>> {
    return { medications: ["warfarin"], allergies: [], interventions: [] };
  }

  async sbar(): Promise<string | null> {
    return null;
  }
}

const requirementsEngine: RequirementsEngine = {
  determine: async (patient) => deterministicRequirements(patient),
};

describe("HospitalCoordinator", () => {
  it("completes the mock call, ranking, confirmation, and handoff flow", async () => {
    const events = new MemoryEvents();
    const provider = new MockA1MobileProvider({ a1mobileMockDelayMs: 0 });
    const coordinator = new HospitalCoordinator(
      environment,
      provider,
      events,
      requirementsEngine,
    );

    const started = await coordinator.begin(DEMO_PATIENT, cloneDemoHospitals());
    const ranked = await started.completion;

    expect(ranked.status).toBe("ranked");
    expect(ranked.responses).toHaveLength(3);
    expect(ranked.recommendedHospitalId).toBe("ucsf");
    expect(ranked.ranking[0]).toMatchObject({ hospitalId: "ucsf", score: 30 });

    const confirmed = await coordinator.confirm(ranked.id);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedHospitalId).toBe("ucsf");
    expect(provider.handoffs).toHaveLength(1);
    expect(provider.handoffs[0]?.message).toContain("Live MedCrew handoff");

    const stages = events.values.map((event) => event.payload.stage);
    expect(stages).toContain("requirements_determined");
    expect(stages.filter((stage) => stage === "hospital_call_started")).toHaveLength(3);
    expect(stages.filter((stage) => stage === "hospital_response")).toHaveLength(3);
    expect(stages).toContain("destination_recommended");
    expect(stages).toContain("destination_confirmed");
    expect(stages).toContain("live_handoff_started");
  });
});
