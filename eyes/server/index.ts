import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { ConvexGateway } from "./convex.js";
import { getEnvironment } from "./env.js";
import { analyzeMonitorFrame, createLiveToken } from "./gemini.js";
import { VitalPublisher } from "./vitals.js";

const environment = getEnvironment();
const gateway = new ConvexGateway(environment);
const publisher = new VitalPublisher(gateway);
const app = express();
const production = process.argv.includes("--production");

app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: Boolean(environment.geminiApiKey) && gateway.mode !== "missing",
    geminiConfigured: Boolean(environment.geminiApiKey),
    convexConfigured: gateway.mode !== "missing",
    convexMode: gateway.mode,
    liveModel: environment.liveModel,
    visionModel: environment.visionModel,
  });
});

app.post("/api/live-token", async (_request, response) => {
  try {
    const result = await createLiveToken(environment);
    response.json({ ...result, model: environment.liveModel });
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : "Token error" });
  }
});

app.post("/api/tools/report-vitals", async (request, response) => {
  try {
    response.json(await publisher.publish(request.body));
  } catch (error) {
    const status = error instanceof RangeError || error instanceof TypeError ? 400 : 503;
    response.status(status).json({ error: error instanceof Error ? error.message : "Publish error" });
  }
});

app.post("/api/tools/query-patient-state", async (_request, response) => {
  try {
    response.json(await gateway.queryPatientState());
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : "Query error" });
  }
});

app.post("/api/fallback/analyze", async (request, response) => {
  try {
    const image = (request.body as { image?: unknown })?.image;
    if (typeof image !== "string") {
      response.status(400).json({ error: "image is required" });
      return;
    }

    const reading = await analyzeMonitorFrame(environment, image);
    if (!reading) {
      response.json({ detected: false });
      return;
    }

    const publish = await publisher.publish(reading);
    response.json({ detected: true, reading, publish });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fallback analysis error";
    response.status(message.includes("data URL") ? 400 : 503).json({ error: message });
  }
});

if (production) {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const clientDirectory = path.resolve(currentDirectory, "../dist/client");
  app.use(express.static(clientDirectory));
  app.use((_request, response) => response.sendFile(path.join(clientDirectory, "index.html")));
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(environment.port, environment.host, () => {
  console.log(`MediBot Eyes listening on http://localhost:${environment.port}`);
  console.log(`Convex mode: ${gateway.mode}; Live model: ${environment.liveModel}`);
});
