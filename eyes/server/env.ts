import dotenv from "dotenv";

dotenv.config();

export interface EyesEnvironment {
  geminiApiKey?: string;
  liveModel: string;
  visionModel: string;
  convexUrl?: string;
  convexAppendFunction: string;
  convexPatientStateFunction: string;
  convexMock: boolean;
  host: string;
  port: number;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

export function getEnvironment(): EyesEnvironment {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
    liveModel: process.env.GEMINI_LIVE_MODEL?.trim() || "gemini-3.1-flash-live-preview",
    visionModel: process.env.GEMINI_VISION_MODEL?.trim() || "gemini-3.6-flash",
    convexUrl: process.env.CONVEX_URL?.trim() || undefined,
    convexAppendFunction: process.env.CONVEX_APPEND_FUNCTION?.trim() || "events:append",
    convexPatientStateFunction:
      // brain/'s real function path (see brain/README.md function-name contract)
      process.env.CONVEX_PATIENT_STATE_FUNCTION?.trim() || "patientState:patientState",
    convexMock: parseBoolean(process.env.CONVEX_MOCK),
    host: process.env.HOST?.trim() || "0.0.0.0",
    port: parsePort(process.env.PORT),
  };
}
