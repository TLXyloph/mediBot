import type { Hospital, PatientSnapshot } from "./types.js";

export const DEMO_PATIENT: PatientSnapshot = {
  age: 54,
  sex: "male",
  chiefComplaint: "crushing chest pain with hypotension",
  symptoms: ["chest pain", "diaphoresis", "weakness"],
  medications: ["warfarin"],
  allergies: [],
  interventions: ["IV access", "12-lead ECG"],
  vitals: {
    hrBpm: 108,
    spo2Pct: 94,
    systolicMmHg: 90,
    diastolicMmHg: 60,
  },
  locationLabel: "Frontier Tower, San Francisco",
};

export const DEMO_HOSPITALS: Hospital[] = [
  {
    id: "ucsf",
    name: "UCSF",
    phone: "+15550001001",
    travelMinutes: 12,
    capabilities: ["general", "cardiac", "stroke", "pediatric"],
    state: { accepting: true, offloadMinutes: 18 },
  },
  {
    id: "sf-general",
    name: "SF General",
    phone: "+15550001002",
    travelMinutes: 8,
    capabilities: ["general", "cardiac", "stroke", "trauma"],
    state: { accepting: true, offloadMinutes: 52 },
  },
  {
    id: "st-marys",
    name: "St. Mary's",
    phone: "+15550001003",
    travelMinutes: 6,
    capabilities: ["general", "cardiac"],
    state: { accepting: false, offloadMinutes: null, reason: "Capacity" },
  },
];

export function cloneDemoHospitals(): Hospital[] {
  return structuredClone(DEMO_HOSPITALS);
}
