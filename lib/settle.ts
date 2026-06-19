import { randomUUID } from "node:crypto";
import type { LiveAnalysis, Settlement } from "./live-types";

export function settleAnalysis(analysis: LiveAnalysis, observedPrice: number): Settlement {
  const rawReturn = (observedPrice - analysis.market.markPrice) / analysis.market.markPrice;
  const unhedgedPnl = analysis.positionValue * rawReturn;
  const hedgePnl = -analysis.hedgeNotional * rawReturn;
  const hedgedPnl = unhedgedPnl + hedgePnl;
  return {
    id: randomUUID(),
    analysisId: analysis.id,
    createdAt: new Date().toISOString(),
    ticker: analysis.ticker,
    observedPrice,
    intervalHit: observedPrice >= analysis.shadowLow && observedPrice <= analysis.shadowHigh,
    rawReturn,
    unhedgedPnl,
    hedgedPnl,
    lossAvoided: hedgedPnl - unhedgedPnl
  };
}
