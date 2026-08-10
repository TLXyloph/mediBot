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
  a1mobileProvider: "mock" | "hack";
  a1mobileApiBaseUrl: string;
  a1mobileTeamKey: string | undefined;
  a1mobilePhoneNumber: string | undefined;
  a1mobileSipUsername: string | undefined;
  a1mobileSipPassword: string | undefined;
  a1mobileVoiceWebhookUrl: string | undefined;
  a1mobileSmsWebhookUrl: string | undefined;
  a1mobileAutoPoint: boolean;
  a1mobileAllowRealCalls: boolean;
  a1mobileMockDelayMs: number;
  a1mobileAllowedNumbers: string[];
  a1mobileAdminToken: string | undefined;
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

export function getEnvironment(): Environment {
  const provider = process.env.A1MOBILE_PROVIDER?.trim().toLowerCase() || "mock";
  if (provider !== "mock" && provider !== "hack") {
    throw new Error("A1MOBILE_PROVIDER must be mock or hack");
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
    a1mobileApiBaseUrl:
      process.env.A1MOBILE_API_BASE_URL?.trim().replace(/\/$/, "") ||
      "https://hack.a1mobile.com/api",
    a1mobileTeamKey: optional(process.env.A1MOBILE_TEAM_KEY),
    a1mobilePhoneNumber: optional(process.env.A1MOBILE_PHONE_NUMBER),
    a1mobileSipUsername: optional(process.env.A1MOBILE_SIP_USERNAME),
    a1mobileSipPassword: optional(process.env.A1MOBILE_SIP_PASSWORD),
    a1mobileVoiceWebhookUrl: optional(process.env.A1MOBILE_VOICE_WEBHOOK_URL),
    a1mobileSmsWebhookUrl: optional(process.env.A1MOBILE_SMS_WEBHOOK_URL),
    a1mobileAutoPoint: booleanValue(process.env.A1MOBILE_AUTO_POINT, false),
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
    a1mobileAdminToken: optional(process.env.A1MOBILE_ADMIN_TOKEN),
  };
}
