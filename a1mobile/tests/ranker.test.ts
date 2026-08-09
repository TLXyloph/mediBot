import { describe, expect, it } from "vitest";
import { cloneDemoHospitals } from "../src/hospitals.js";
import { rankHospitals, recommendedHospitalId } from "../src/ranker.js";
import type { HospitalResponse, ReceivingRequirements } from "../src/types.js";

const requirements: ReceivingRequirements = {
  acuity: "emergent",
  capabilities: ["general", "cardiac"],
  reasons: ["Chest pain with hypotension"],
  clinicalSummary: "54-year-old with chest pain, BP 90/60",
};

function response(
  hospitalId: string,
  hospitalName: string,
  accepted: boolean,
  offloadMinutes: number | null,
): HospitalResponse {
  return {
    caseId: "case-1",
    hospitalId,
    hospitalName,
    accepted,
    offloadMinutes,
    capabilities: ["general", "cardiac"],
    callId: `call-${hospitalId}`,
    transcript: "test",
    receivedAt: 1,
  };
}

describe("rankHospitals", () => {
  it("ranks by travel plus offload while enforcing acceptance and capability", () => {
    const ranking = rankHospitals(
      cloneDemoHospitals(),
      [
        response("ucsf", "UCSF", true, 18),
        response("sf-general", "SF General", true, 52),
        response("st-marys", "St. Mary's", false, null),
      ],
      requirements,
    );

    expect(ranking.map((entry) => entry.hospitalId)).toEqual(["ucsf", "sf-general", "st-marys"]);
    expect(ranking[0]).toMatchObject({ score: 30, eligible: true });
    expect(ranking[1]).toMatchObject({ score: 60, eligible: true });
    expect(ranking[2]).toMatchObject({ score: null, eligible: false });
    expect(recommendedHospitalId(ranking)).toBe("ucsf");
  });

  it("rejects an accepted hospital that lacks a required capability", () => {
    const hospitals = cloneDemoHospitals();
    const limited = hospitals[0]!;
    limited.capabilities = ["general"];
    const ranking = rankHospitals(
      [limited],
      [
        {
          ...response("ucsf", "UCSF", true, 5),
          capabilities: ["general"],
        },
      ],
      requirements,
    );

    expect(ranking[0]).toMatchObject({ eligible: false, score: null, missingCapabilities: ["cardiac"] });
    expect(recommendedHospitalId(ranking)).toBeNull();
  });
});
