import { randomUUID } from "node:crypto";
import type { Environment } from "./env.js";
import { coordinationEvent, type CoordinationEventSink } from "./convex.js";
import { rankHospitals, recommendedHospitalId } from "./ranker.js";
import type { RequirementsEngine } from "./requirements.js";
import { CaseStore } from "./store.js";
import type {
  CoordinationCall,
  CoordinationCase,
  Hospital,
  HospitalResponse,
  PatientSnapshot,
  ProviderWebhookResult,
  ReceivingRequirements,
} from "./types.js";
import type { A1MobileProvider } from "./providers/provider.js";

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function buildSbar(patient: PatientSnapshot, requirements: ReceivingRequirements): string {
  return [
    `Situation: ${patient.age}-year-old ${patient.sex ?? "patient"} with ${patient.chiefComplaint}.`,
    `Background: Medications ${patient.medications.join(", ") || "none known"}; allergies ${patient.allergies.join(", ") || "none known"}.`,
    `Assessment: HR ${patient.vitals.hrBpm}, SpO₂ ${patient.vitals.spo2Pct}%, BP ${patient.vitals.systolicMmHg}/${patient.vitals.diastolicMmHg}. ${requirements.acuity} acuity.`,
    `Recommendation: ${requirements.capabilities.join(", ")} capability required. Interventions: ${patient.interventions.join(", ") || "none recorded"}.`,
  ].join("\n");
}

function callPrompt(
  hospital: Hospital,
  patient: PatientSnapshot,
  requirements: ReceivingRequirements,
): string {
  return `This is MedCrew EMS coordination. We have a ${patient.age}-year-old ${patient.sex ?? "patient"} with ${patient.chiefComplaint}, BP ${patient.vitals.systolicMmHg}/${patient.vitals.diastolicMmHg}, ETA ${hospital.travelMinutes} minutes. Required capability: ${requirements.capabilities.join(", ")}. Can you accept this patient, and what is your estimated offload time?`;
}

function hospitalPayload(hospital: Hospital): Record<string, unknown> {
  return {
    hospitalId: hospital.id,
    hospitalName: hospital.name,
    travelMinutes: hospital.travelMinutes,
  };
}

export interface BeginCaseResult {
  coordinationCase: CoordinationCase;
  completion: Promise<CoordinationCase>;
}

export class HospitalCoordinator {
  constructor(
    private readonly environment: Environment,
    private readonly provider: A1MobileProvider,
    private readonly events: CoordinationEventSink,
    private readonly requirementsEngine: RequirementsEngine,
    readonly store = new CaseStore(),
  ) {}

  async begin(patient: PatientSnapshot, hospitals: Hospital[]): Promise<BeginCaseResult> {
    if (!hospitals.length) throw new Error("At least one hospital is required");
    const context = await this.events.patientContext();
    const mergedPatient: PatientSnapshot = {
      ...patient,
      medications: unique([...patient.medications, ...(context.medications ?? [])]),
      allergies: unique([...patient.allergies, ...(context.allergies ?? [])]),
      interventions: unique([...patient.interventions, ...(context.interventions ?? [])]),
    };
    const requirements = await this.requirementsEngine.determine(mergedPatient);
    const sbar = (await this.events.sbar()) ?? buildSbar(mergedPatient, requirements);
    const now = Date.now();
    const coordinationCase = this.store.create({
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: "preparing",
      patient: mergedPatient,
      requirements,
      sbar,
      hospitals: structuredClone(hospitals),
      callIds: {},
      responses: [],
      ranking: [],
      recommendedHospitalId: null,
      confirmedHospitalId: null,
    });

    await this.events.append(
      coordinationEvent("requirements_determined", {
        caseId: coordinationCase.id,
        requirements,
      }),
    );

    const completion = this.runCalls(coordinationCase.id);
    return { coordinationCase: this.store.get(coordinationCase.id)!, completion };
  }

  async recordWebhook(result: ProviderWebhookResult): Promise<CoordinationCase> {
    const coordinationCase = this.store.get(result.caseId);
    if (!coordinationCase) throw new Error(`Unknown coordination case: ${result.caseId}`);
    const hospital = coordinationCase.hospitals.find((candidate) => candidate.id === result.hospitalId);
    if (!hospital) throw new Error(`Unknown hospital for case: ${result.hospitalId}`);

    return this.recordResponse({
      ...result,
      hospitalName: hospital.name,
      capabilities: result.capabilities.length ? result.capabilities : [...hospital.capabilities],
      receivedAt: Date.now(),
    });
  }

  async confirm(caseId: string, hospitalId?: string): Promise<CoordinationCase> {
    const coordinationCase = this.store.get(caseId);
    if (!coordinationCase) throw new Error(`Unknown coordination case: ${caseId}`);
    const selectedId = hospitalId ?? coordinationCase.recommendedHospitalId;
    if (!selectedId) throw new Error("No eligible hospital is available to confirm");
    const ranking = coordinationCase.ranking.find((entry) => entry.hospitalId === selectedId);
    if (!ranking?.eligible) throw new Error("Selected hospital is not eligible");
    const hospital = coordinationCase.hospitals.find((candidate) => candidate.id === selectedId);
    if (!hospital) throw new Error(`Unknown hospital: ${selectedId}`);

    const updated = this.store.mutate(caseId, (value) => {
      value.status = "confirmed";
      value.confirmedHospitalId = selectedId;
    });
    await this.events.append(
      coordinationEvent("destination_confirmed", {
        caseId,
        ...hospitalPayload(hospital),
        score: ranking.score,
      }, "system"),
    );
    await this.provider.sendHandoff({
      caseId,
      hospitalId: hospital.id,
      toNumber: hospital.phone,
      message: `Destination confirmed. Live MedCrew handoff follows.\n\n${coordinationCase.sbar}`,
    });
    await this.events.append(
      coordinationEvent("live_handoff_started", {
        caseId,
        hospitalId: hospital.id,
        hospitalName: hospital.name,
        sbar: coordinationCase.sbar,
      }),
    );
    return updated;
  }

  private async runCalls(caseId: string): Promise<CoordinationCase> {
    const initial = this.store.mutate(caseId, (value) => {
      value.status = "calling";
    });

    const attempts = initial.hospitals.map(async (hospital) => {
      await this.events.append(
        coordinationEvent("hospital_call_started", { caseId, ...hospitalPayload(hospital) }),
      );
      const call: CoordinationCall = {
        caseId,
        hospital,
        patient: initial.patient,
        requirements: initial.requirements,
        sbar: initial.sbar,
        prompt: callPrompt(hospital, initial.patient, initial.requirements),
        callbackUrl: `${this.environment.publicBaseUrl}/api/a1mobile/webhook`,
      };
      const result = await this.provider.placeCoordinationCall(call);
      this.store.mutate(caseId, (value) => {
        value.callIds[hospital.id] = result.callId;
      });
      if (result.response) await this.recordResponse(result.response);
    });

    const settled = await Promise.allSettled(attempts);
    const failures = settled
      .map((result, index) => ({ result, hospital: initial.hospitals[index] }))
      .filter((item): item is { result: PromiseRejectedResult; hospital: Hospital } => item.result.status === "rejected");

    for (const failure of failures) {
      await this.events.append(
        coordinationEvent("hospital_call_failed", {
          caseId,
          ...hospitalPayload(failure.hospital),
          error: failure.result.reason instanceof Error ? failure.result.reason.message : String(failure.result.reason),
        }, "system"),
      );
    }

    return this.store.mutate(caseId, (value) => {
      if (value.responses.length > 0) value.status = "ranked";
      else if (settled.every((result) => result.status === "rejected")) {
        value.status = "failed";
        value.error = "All hospital calls failed";
      }
    });
  }

  private async recordResponse(response: HospitalResponse): Promise<CoordinationCase> {
    const updated = this.store.mutate(response.caseId, (value) => {
      const existingIndex = value.responses.findIndex((item) => item.hospitalId === response.hospitalId);
      if (existingIndex >= 0) value.responses[existingIndex] = structuredClone(response);
      else value.responses.push(structuredClone(response));
      value.ranking = rankHospitals(value.hospitals, value.responses, value.requirements);
      value.recommendedHospitalId = recommendedHospitalId(value.ranking);
      value.status = "ranked";
    });

    await this.events.append(
      coordinationEvent("hospital_response", {
        caseId: response.caseId,
        hospitalId: response.hospitalId,
        hospitalName: response.hospitalName,
        accepted: response.accepted,
        offloadMinutes: response.offloadMinutes,
        capabilities: response.capabilities,
        ...(response.reason ? { reason: response.reason } : {}),
        callId: response.callId,
        transcript: response.transcript,
      }),
    );

    if (updated.recommendedHospitalId) {
      const recommendation = updated.ranking.find(
        (entry) => entry.hospitalId === updated.recommendedHospitalId,
      );
      await this.events.append(
        coordinationEvent("destination_recommended", {
          caseId: response.caseId,
          recommendation,
          formula: "travelMinutes + offloadMinutes; required capability is mandatory",
        }),
      );
    }
    return updated;
  }
}
