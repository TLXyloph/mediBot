import { GoogleGenAI, Type } from "@google/genai";
import type { Environment } from "./env.js";
import type { Acuity, Capability, PatientSnapshot, ReceivingRequirements } from "./types.js";

const CAPABILITIES: Capability[] = ["general", "cardiac", "stroke", "trauma", "pediatric", "burn"];
const ACUITIES: Acuity[] = ["critical", "emergent", "urgent"];

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

export function deterministicRequirements(patient: PatientSnapshot): ReceivingRequirements {
  const text = [patient.chiefComplaint, ...patient.symptoms].join(" ").toLowerCase();
  const capabilities = new Set<Capability>(["general"]);
  const reasons: string[] = [];

  if (hasAny(text, ["chest", "cardiac", "stemi"]) || patient.vitals.systolicMmHg < 100) {
    capabilities.add("cardiac");
    reasons.push("Chest pain with hypotension requires cardiac-capable emergency care");
  }
  if (hasAny(text, ["stroke", "facial droop", "slurred speech"])) {
    capabilities.add("stroke");
    reasons.push("Neurologic symptoms require stroke capability");
  }
  if (hasAny(text, ["trauma", "collision", "gunshot", "fall"])) {
    capabilities.add("trauma");
    reasons.push("Mechanism or injuries require trauma capability");
  }
  if (patient.age < 16) {
    capabilities.add("pediatric");
    reasons.push("Patient age requires pediatric capability");
  }
  if (hasAny(text, ["burn", "inhalation injury"])) {
    capabilities.add("burn");
    reasons.push("Burn presentation requires burn capability");
  }

  const critical =
    patient.vitals.systolicMmHg < 90 || patient.vitals.spo2Pct < 90 || patient.vitals.hrBpm > 140;
  const emergent =
    patient.vitals.systolicMmHg < 100 || patient.vitals.spo2Pct < 94 || capabilities.size > 1;

  return {
    acuity: critical ? "critical" : emergent ? "emergent" : "urgent",
    capabilities: [...capabilities],
    reasons: reasons.length ? reasons : ["General emergency evaluation required"],
    clinicalSummary: `${patient.age}-year-old ${patient.sex ?? "patient"} with ${patient.chiefComplaint}; HR ${patient.vitals.hrBpm}, SpO₂ ${patient.vitals.spo2Pct}%, BP ${patient.vitals.systolicMmHg}/${patient.vitals.diastolicMmHg}.`,
  };
}

function normalizeRequirements(value: unknown, fallback: ReceivingRequirements): ReceivingRequirements {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.filter(
        (item): item is Capability => typeof item === "string" && CAPABILITIES.includes(item as Capability),
      )
    : [];
  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.filter((item): item is string => typeof item === "string")
    : [];
  const acuity = typeof raw.acuity === "string" && ACUITIES.includes(raw.acuity as Acuity)
    ? (raw.acuity as Acuity)
    : fallback.acuity;

  return {
    acuity,
    capabilities: capabilities.length ? capabilities : fallback.capabilities,
    reasons: reasons.length ? reasons : fallback.reasons,
    clinicalSummary:
      typeof raw.clinicalSummary === "string" ? raw.clinicalSummary : fallback.clinicalSummary,
  };
}

export interface RequirementsEngine {
  determine(patient: PatientSnapshot): Promise<ReceivingRequirements>;
}

export class GeminiRequirementsEngine implements RequirementsEngine {
  constructor(private readonly environment: Environment) {}

  async determine(patient: PatientSnapshot): Promise<ReceivingRequirements> {
    const fallback = deterministicRequirements(patient);
    if (this.environment.geminiMock || !this.environment.geminiApiKey) return fallback;

    const ai = new GoogleGenAI({ apiKey: this.environment.geminiApiKey });
    const response = await ai.models.generateContent({
      model: this.environment.geminiModel,
      contents: [
        {
          text:
            "Determine only the receiving emergency-department capabilities required by this EMS patient. Do not recommend a named hospital. Prefer the smallest safe capability set. Patient JSON:\n" +
            JSON.stringify(patient),
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            acuity: { type: Type.STRING, enum: ACUITIES },
            capabilities: { type: Type.ARRAY, items: { type: Type.STRING, enum: CAPABILITIES } },
            reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
            clinicalSummary: { type: Type.STRING },
          },
          required: ["acuity", "capabilities", "reasons", "clinicalSummary"],
        },
      },
    });

    return normalizeRequirements(JSON.parse(response.text ?? "{}"), fallback);
  }
}
