import { createHash } from "node:crypto";
import type { ReplayResult, ReplayScenario } from "./types";

export function calculateReplay(scenario: ReplayScenario): ReplayResult {
  const shadowMid = (scenario.shadowLow + scenario.shadowHigh) / 2;
  const actualGap = (scenario.actualOpen - scenario.lastClose) / scenario.lastClose;
  const exposedCapital = scenario.portfolioValue * scenario.exposedWeight;
  const unprotectedLoss = exposedCapital * actualGap;
  const protectedLoss = exposedCapital * actualGap * (1 - scenario.hedgeWeight);
  const avoidedLoss = protectedLoss - unprotectedLoss;
  const proofPayload = {
    scenarioId: scenario.id,
    eventTime: scenario.eventTime,
    shadowRange: [scenario.shadowLow, scenario.shadowHigh],
    expectedGap: scenario.expectedGap,
    confidence: scenario.confidence,
    hedgeWeight: scenario.hedgeWeight
  };

  return {
    ...scenario,
    shadowMid,
    actualGap,
    unprotectedLoss,
    protectedLoss,
    avoidedLoss,
    intervalHit:
      scenario.actualOpen >= scenario.shadowLow && scenario.actualOpen <= scenario.shadowHigh,
    commitment: createHash("sha256").update(JSON.stringify(proofPayload)).digest("hex")
  };
}
