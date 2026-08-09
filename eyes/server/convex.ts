import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { EyesEnvironment } from "./env.js";
import type { PatientState, VitalEvent } from "../src/shared/types.js";
import type { EventSink } from "./vitals.js";

function resolveFunctionReference<Type extends "mutation" | "query">(
  path: string,
): FunctionReference<Type, "public", any, any> {
  const [moduleName, functionName, ...rest] = path.split(":");
  if (!moduleName || !functionName || rest.length > 0) {
    throw new Error(`Invalid Convex function name: ${path}`);
  }

  const api = anyApi as unknown as Record<string, Record<string, unknown>>;
  return api[moduleName]?.[functionName] as FunctionReference<Type, "public", any, any>;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizePatientState(value: unknown): PatientState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    medications: strings(raw.medications ?? raw.meds),
    allergies: strings(raw.allergies),
    lastEpinephrineAt: nullableTimestamp(
      raw.lastEpinephrineAt ?? raw.lastEpiAt ?? raw.lastEpi,
    ),
    protocolPosition: nullableString(raw.protocolPosition ?? raw.protocol_state),
  };
}

export interface PatientStateSource {
  queryPatientState(): Promise<PatientState>;
}

export class ConvexGateway implements EventSink, PatientStateSource {
  private readonly client?: ConvexHttpClient;
  private readonly appendReference?: FunctionReference<"mutation", "public", any, any>;
  private readonly patientStateReference?: FunctionReference<"query", "public", any, any>;
  private readonly mockEvents: VitalEvent[] = [];
  private readonly mockStartedAt = Date.now();

  constructor(private readonly environment: EyesEnvironment) {
    if (!environment.convexMock && environment.convexUrl) {
      this.client = new ConvexHttpClient(environment.convexUrl);
      this.appendReference = resolveFunctionReference<"mutation">(environment.convexAppendFunction);
      this.patientStateReference = resolveFunctionReference<"query">(
        environment.convexPatientStateFunction,
      );
    }
  }

  get mode(): "live" | "mock" | "missing" {
    if (this.environment.convexMock) return "mock";
    return this.client ? "live" : "missing";
  }

  async appendVital(event: VitalEvent): Promise<string | undefined> {
    if (this.environment.convexMock) {
      this.mockEvents.push(structuredClone(event));
      return `mock-${this.mockEvents.length}`;
    }

    if (!this.client || !this.appendReference) {
      throw new Error("CONVEX_URL is required unless CONVEX_MOCK=true");
    }

    const result = await this.client.mutation(this.appendReference, event);
    if (typeof result === "string") return result;
    if (result && typeof result === "object" && "eventId" in result) {
      const eventId = (result as { eventId?: unknown }).eventId;
      return typeof eventId === "string" ? eventId : undefined;
    }
    return undefined;
  }

  async queryPatientState(): Promise<PatientState> {
    if (this.environment.convexMock) {
      return {
        medications: ["warfarin"],
        allergies: [],
        lastEpinephrineAt: this.mockStartedAt - 3 * 60_000,
        protocolPosition: "post-epinephrine monitoring",
      };
    }

    if (!this.client || !this.patientStateReference) {
      throw new Error("CONVEX_URL is required unless CONVEX_MOCK=true");
    }

    const result = await this.client.query(this.patientStateReference, {});
    return normalizePatientState(result);
  }
}
