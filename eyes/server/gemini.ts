import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { EyesEnvironment } from "./env.js";
import type { VitalsReading } from "../src/shared/types.js";
import { validateVitals } from "./vitals.js";

const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

function configuredClient(environment: EyesEnvironment, apiVersion = "v1beta"): GoogleGenAI {
  if (!environment.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleGenAI({
    apiKey: environment.geminiApiKey,
    httpOptions: { apiVersion },
  });
}

export async function createLiveToken(environment: EyesEnvironment): Promise<{
  token: string;
  expiresAt: string;
}> {
  const ai = configuredClient(environment, "v1alpha");
  const expires = new Date(Date.now() + 30 * 60_000);
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: expires.toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
      liveConnectConstraints: {
        model: environment.liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
        },
      },
      httpOptions: { apiVersion: "v1alpha" },
    },
  });

  if (!token.name) {
    throw new Error("Gemini did not return an ephemeral token");
  }

  return { token: token.name, expiresAt: expires.toISOString() };
}

export async function analyzeMonitorFrame(
  environment: EyesEnvironment,
  imageDataUrl: string,
): Promise<VitalsReading | null> {
  const match = DATA_URL_PATTERN.exec(imageDataUrl);
  if (!match?.[1] || !match[2]) {
    throw new Error("image must be a JPEG, PNG, or WebP data URL");
  }

  const ai = configuredClient(environment);
  const response = await ai.models.generateContent({
    model: environment.visionModel,
    contents: [
      {
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      },
      {
        text:
          "Read the simulated patient monitor. Return detected=false unless HR, SpO2, systolic BP, and diastolic BP are all clearly visible. Do not infer obscured digits.",
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detected: { type: Type.BOOLEAN },
          hrBpm: { type: Type.INTEGER },
          spo2Pct: { type: Type.INTEGER },
          systolicMmHg: { type: Type.INTEGER },
          diastolicMmHg: { type: Type.INTEGER },
          confidence: { type: Type.NUMBER },
        },
        required: ["detected", "confidence"],
      },
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as Record<string, unknown>;
  if (parsed.detected !== true) return null;
  return validateVitals(parsed);
}
