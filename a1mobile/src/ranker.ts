import type {
  Capability,
  Hospital,
  HospitalResponse,
  RankingEntry,
  ReceivingRequirements,
} from "./types.js";

export interface RankingWeights {
  travel: number;
  offload: number;
}

const DEFAULT_WEIGHTS: RankingWeights = { travel: 1, offload: 1 };

function missingCapabilities(
  required: Capability[],
  available: Capability[],
): Capability[] {
  return required.filter((capability) => !available.includes(capability));
}

export function rankHospitals(
  hospitals: Hospital[],
  responses: HospitalResponse[],
  requirements: ReceivingRequirements,
  weights: RankingWeights = DEFAULT_WEIGHTS,
): RankingEntry[] {
  const responseByHospital = new Map(responses.map((response) => [response.hospitalId, response]));

  return hospitals
    .map((hospital): RankingEntry => {
      const response = responseByHospital.get(hospital.id);
      const available = response?.capabilities ?? hospital.capabilities;
      const missing = missingCapabilities(requirements.capabilities, available);
      const accepted = response?.accepted === true;
      const offloadMinutes = response?.offloadMinutes ?? null;
      const eligible = accepted && offloadMinutes !== null && missing.length === 0;

      return {
        hospitalId: hospital.id,
        hospitalName: hospital.name,
        eligible,
        travelMinutes: hospital.travelMinutes,
        offloadMinutes,
        missingCapabilities: missing,
        score: eligible
          ? hospital.travelMinutes * weights.travel + offloadMinutes * weights.offload
          : null,
      };
    })
    .sort((left, right) => {
      if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
      if (left.score !== right.score) return (left.score ?? Number.MAX_SAFE_INTEGER) - (right.score ?? Number.MAX_SAFE_INTEGER);
      return left.travelMinutes - right.travelMinutes;
    });
}

export function recommendedHospitalId(ranking: RankingEntry[]): string | null {
  return ranking.find((entry) => entry.eligible)?.hospitalId ?? null;
}
