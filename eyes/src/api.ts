import type {
  FallbackAnalysisResponse,
  HealthResponse,
  LiveTokenResponse,
  PatientState,
  PublishResult,
  VitalsReading,
} from "./shared/types.js";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || `${response.status} ${response.statusText}`);
  }
  return body;
}

export const api = {
  health: () => requestJson<HealthResponse>("/api/health"),
  createLiveToken: () =>
    requestJson<LiveTokenResponse>("/api/live-token", { method: "POST", body: "{}" }),
  reportVitals: (reading: VitalsReading) =>
    requestJson<PublishResult>("/api/tools/report-vitals", {
      method: "POST",
      body: JSON.stringify(reading),
    }),
  queryPatientState: () =>
    requestJson<PatientState>("/api/tools/query-patient-state", {
      method: "POST",
      body: "{}",
    }),
  analyzeFrame: (image: string) =>
    requestJson<FallbackAnalysisResponse>("/api/fallback/analyze", {
      method: "POST",
      body: JSON.stringify({ image }),
    }),
};
