import express, { type NextFunction, type Request, type Response } from "express";
import { resolve } from "node:path";
import { getEnvironment } from "../src/env.js";
import { ConvexCoordinationGateway } from "../src/convex.js";
import { HospitalCoordinator } from "../src/coordinator.js";
import { cloneDemoHospitals, DEMO_PATIENT } from "../src/hospitals.js";
import { GeminiRequirementsEngine } from "../src/requirements.js";
import { MockA1MobileProvider } from "../src/providers/mock.js";
import { RestA1MobileProvider } from "../src/providers/rest.js";
import type { A1MobileProvider } from "../src/providers/provider.js";
import type { Hospital, PatientSnapshot } from "../src/types.js";

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

const environment = getEnvironment();
const events = new ConvexCoordinationGateway(environment);
const provider: A1MobileProvider =
  environment.a1mobileProvider === "rest"
    ? new RestA1MobileProvider(environment)
    : new MockA1MobileProvider(environment);
const coordinator = new HospitalCoordinator(
  environment,
  provider,
  events,
  new GeminiRequirementsEngine(environment),
);

const app = express();
app.disable("x-powered-by");
app.use(
  express.json({
    limit: "256kb",
    verify: (request, _response, buffer) => {
      (request as RawBodyRequest).rawBody = Buffer.from(buffer);
    },
  }),
);

function isPatientSnapshot(value: unknown): value is PatientSnapshot {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  const vitals = raw.vitals as Record<string, unknown> | undefined;
  return (
    typeof raw.age === "number" &&
    raw.age > 0 &&
    typeof raw.chiefComplaint === "string" &&
    Array.isArray(raw.symptoms) &&
    Array.isArray(raw.medications) &&
    Array.isArray(raw.allergies) &&
    Array.isArray(raw.interventions) &&
    Boolean(vitals) &&
    [vitals?.hrBpm, vitals?.spo2Pct, vitals?.systolicMmHg, vitals?.diastolicMmHg].every(
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  );
}

function isHospitalList(value: unknown): value is Hospital[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.phone === "string" &&
        typeof item.travelMinutes === "number" &&
        Array.isArray(item.capabilities) &&
        item.state &&
        typeof item.state === "object" &&
        typeof item.state.accepting === "boolean",
    )
  );
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "medcrew-a1mobile",
    provider: provider.name,
    realCallsEnabled: environment.a1mobileAllowRealCalls,
    convexMode: events.mode,
    geminiMode: environment.geminiMock || !environment.geminiApiKey ? "mock" : "live",
  });
});

app.get("/api/cases", (_request, response) => {
  response.json({ cases: coordinator.store.list() });
});

app.post("/api/cases", async (request, response) => {
  const patient = request.body?.patient ?? DEMO_PATIENT;
  const hospitals = request.body?.hospitals ?? cloneDemoHospitals();
  if (!isPatientSnapshot(patient)) {
    response.status(400).json({ error: "A valid patient snapshot is required" });
    return;
  }
  if (!isHospitalList(hospitals)) {
    response.status(400).json({ error: "At least one valid hospital is required" });
    return;
  }

  const started = await coordinator.begin(patient, hospitals);
  void started.completion.catch((error: unknown) => {
    console.error("Coordination failed", error);
  });
  response.status(202).json({ case: started.coordinationCase });
});

app.get("/api/cases/:caseId", (request, response) => {
  const value = coordinator.store.get(request.params.caseId);
  if (!value) {
    response.status(404).json({ error: "Case not found" });
    return;
  }
  response.json({ case: value });
});

app.get("/api/cases/:caseId/stream", (request, response) => {
  const initial = coordinator.store.get(request.params.caseId);
  if (!initial) {
    response.status(404).json({ error: "Case not found" });
    return;
  }

  response.status(200);
  response.setHeader("content-type", "text/event-stream");
  response.setHeader("cache-control", "no-cache, no-transform");
  response.setHeader("connection", "keep-alive");
  response.flushHeaders();

  const write = (value: unknown) => response.write(`event: case\ndata: ${JSON.stringify(value)}\n\n`);
  write(initial);
  const unsubscribe = coordinator.store.subscribe(request.params.caseId, write);
  const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
  request.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.post("/api/cases/:caseId/confirm", async (request, response) => {
  const hospitalId =
    typeof request.body?.hospitalId === "string" ? request.body.hospitalId : undefined;
  const value = await coordinator.confirm(request.params.caseId, hospitalId);
  response.json({ case: value });
});

app.post("/api/a1mobile/webhook", async (request: RawBodyRequest, response) => {
  const signature = request.header("x-a1mobile-signature") ?? undefined;
  if (!provider.verifyWebhook(request.rawBody ?? Buffer.alloc(0), signature)) {
    response.status(401).json({ error: "Invalid webhook signature" });
    return;
  }
  const result = provider.parseWebhook(request.body);
  const value = await coordinator.recordWebhook(result);
  response.json({ ok: true, case: value });
});

app.post("/api/hospitals/:hospitalId/availability", (request, response) => {
  const hospital = cloneDemoHospitals().find((candidate) => candidate.id === request.params.hospitalId);
  if (!hospital) {
    response.status(404).json({ error: "Hospital not found" });
    return;
  }
  response.json({
    hospitalId: hospital.id,
    hospitalName: hospital.name,
    accepted: hospital.state.accepting,
    offloadMinutes: hospital.state.offloadMinutes,
    capabilities: hospital.capabilities,
    ...(hospital.state.reason ? { reason: hospital.state.reason } : {}),
    requestedCapabilities: request.body?.capabilities ?? [],
  });
});

app.use(express.static(resolve(process.cwd(), "public"), { extensions: ["html"] }));

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  console.error(error);
  response.status(500).json({ error: message });
});

app.listen(environment.port, environment.host, () => {
  console.log(
    `MedCrew + a1mobile running at http://localhost:${environment.port} (${provider.name}, Convex ${events.mode})`,
  );
});
