import dotenv from "dotenv";

dotenv.config();

export interface Environment {
  host: string;
  port: number;
  publicBaseUrl: string;
  geminiApiKey: string | undefined;
  geminiModel: string;
  geminiMock: boolean;
  convexUrl: string | undefined;
  convexAppendFunction: string;
  convexPatientStateFunction: string;
  convexSbarFunction: string;
  convexMock: boolean;
  a1mobileProvider: "mock" | "rest";
  a1mobileApiBaseUrl: string | undefined;
  a1mobileApiKey: string | undefined;
  a1mobileAgentId: string | undefined;
  a1mobileCallPath: string;
  a1mobileMessagePath: string;
  a1mobileWebhookSecret: string | undefined;
  a1mobileAllowRealCalls: boolean;
  a1mobileMockDelayMs: number;
  a1mobileAllowedNumbers: string[];
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

function integerValue(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

function optional(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function pathValue(value: string | undefined, fallback: string, name: string): string {
  const result = value?.trim() || fallback;
  if (!result.startsWith("/")) throw new Error(`${name} must start with /`);
  return result;
}

export function getEnvironment(): Environment {
  const provider = process.env.A1MOBILE_PROVIDER?.trim().toLowerCase() || "mock";
  if (provider !== "mock" && provider !== "rest") {
    throw new Error("A1MOBILE_PROVIDER must be mock or rest");
  }

  const port = integerValue(process.env.PORT, 4320, "PORT");
  if (port < 1 || port > 65_535) throw new Error("PORT must be between 1 and 65535");

  return {
    host: process.env.HOST?.trim() || "0.0.0.0",
    port,
    publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || `http://localhost:${port}`,
    geminiApiKey: optional(process.env.GEMINI_API_KEY),
    geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash",
    geminiMock: booleanValue(process.env.GEMINI_MOCK, true),
    convexUrl: optional(process.env.CONVEX_URL),
    convexAppendFunction: process.env.CONVEX_APPEND_FUNCTION?.trim() || "events:append",
    convexPatientStateFunction:
      process.env.CONVEX_PATIENT_STATE_FUNCTION?.trim() || "events:patientState",
    convexSbarFunction: process.env.CONVEX_SBAR_FUNCTION?.trim() || "events:sbar",
    convexMock: booleanValue(process.env.CONVEX_MOCK, true),
    a1mobileProvider: provider,
    a1mobileApiBaseUrl: optional(process.env.A1MOBILE_API_BASE_URL),
    a1mobileApiKey: optional(process.env.A1MOBILE_API_KEY),
    a1mobileAgentId: optional(process.env.A1MOBILE_AGENT_ID),
    a1mobileCallPath: pathValue(process.env.A1MOBILE_CALL_PATH, "/v1/calls", "A1MOBILE_CALL_PATH"),
    a1mobileMessagePath: pathValue(
      process.env.A1MOBILE_MESSAGE_PATH,
      "/v1/messages",
      "A1MOBILE_MESSAGE_PATH",
    ),
    a1mobileWebhookSecret: optional(process.env.A1MOBILE_WEBHOOK_SECRET),
    a1mobileAllowRealCalls: booleanValue(process.env.A1MOBILE_ALLOW_REAL_CALLS, false),
    a1mobileMockDelayMs: integerValue(
      process.env.A1MOBILE_MOCK_DELAY_MS,
      700,
      "A1MOBILE_MOCK_DELAY_MS",
    ),
    a1mobileAllowedNumbers: (process.env.A1MOBILE_ALLOWED_NUMBERS ?? "")
      .split(",")
      .map((number) => number.trim())
      .filter(Boolean),
  };
}
