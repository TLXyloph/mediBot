import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { Environment } from "./env.js";
import type { AppendOnlyEvent, PatientSnapshot } from "./types.js";

function functionReference<Type extends "mutation" | "query">(
  path: string,
): FunctionReference<Type, "public", any, any> {
  const [moduleName, functionName, ...rest] = path.split(":");
  if (!moduleName || !functionName || rest.length) throw new Error(`Invalid Convex function: ${path}`);
  const api = anyApi as unknown as Record<string, Record<string, unknown>>;
  return api[moduleName]?.[functionName] as FunctionReference<Type, "public", any, any>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export interface CoordinationEventSink {
  append(event: AppendOnlyEvent): Promise<string | undefined>;
  patientContext(): Promise<Partial<PatientSnapshot>>;
  sbar(): Promise<string | null>;
  readonly mode: "mock" | "live" | "missing";
}

export class ConvexCoordinationGateway implements CoordinationEventSink {
  private readonly client?: ConvexHttpClient;
  private readonly appendRef?: FunctionReference<"mutation", "public", any, any>;
  private readonly patientRef?: FunctionReference<"query", "public", any, any>;
  private readonly sbarRef?: FunctionReference<"query", "public", any, any>;
  readonly mockEvents: AppendOnlyEvent[] = [];

  constructor(private readonly environment: Environment) {
    if (!environment.convexMock && environment.convexUrl) {
      this.client = new ConvexHttpClient(environment.convexUrl);
      this.appendRef = functionReference<"mutation">(environment.convexAppendFunction);
      this.patientRef = functionReference<"query">(environment.convexPatientStateFunction);
      this.sbarRef = functionReference<"query">(environment.convexSbarFunction);
    }
  }

  get mode(): "mock" | "live" | "missing" {
    if (this.environment.convexMock) return "mock";
    return this.client ? "live" : "missing";
  }

  async append(event: AppendOnlyEvent): Promise<string | undefined> {
    if (this.environment.convexMock) {
      this.mockEvents.push(structuredClone(event));
      return `mock-event-${this.mockEvents.length}`;
    }
    if (!this.client || !this.appendRef) throw new Error("CONVEX_URL is required unless CONVEX_MOCK=true");
    const result = await this.client.mutation(this.appendRef, event);
    if (typeof result === "string") return result;
    if (result && typeof result === "object" && "eventId" in result) {
      const eventId = (result as { eventId?: unknown }).eventId;
      return typeof eventId === "string" ? eventId : undefined;
    }
    return undefined;
  }

  async patientContext(): Promise<Partial<PatientSnapshot>> {
    if (this.environment.convexMock) {
      return { medications: ["warfarin"], allergies: [], interventions: ["IV access", "12-lead ECG"] };
    }
    if (!this.client || !this.patientRef) throw new Error("Convex patient state query is unavailable");
    const value = await this.client.query(this.patientRef, {});
    const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    return {
      medications: stringArray(raw.medications ?? raw.meds),
      allergies: stringArray(raw.allergies),
      interventions: stringArray(raw.interventions),
    };
  }

  async sbar(): Promise<string | null> {
    if (this.environment.convexMock) return null;
    if (!this.client || !this.sbarRef) throw new Error("Convex SBAR query is unavailable");
    const value = await this.client.query(this.sbarRef, {});
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const raw = value as Record<string, unknown>;
      if (typeof raw.text === "string") return raw.text;
      if (typeof raw.sbar === "string") return raw.sbar;
      return JSON.stringify(value);
    }
    return null;
  }
}

export function coordinationEvent(
  stage: string,
  payload: Record<string, unknown>,
  source: "agent" | "system" = "agent",
): AppendOnlyEvent {
  return {
    ts: Date.now(),
    type: "sbar_update",
    source,
    role: "medic",
    payload: { kind: "hospital_coordination", stage, ...payload },
    conf: 1,
    refs: [],
  };
}
