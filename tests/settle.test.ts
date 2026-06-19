import assert from "node:assert/strict";
import test from "node:test";
import type { LiveAnalysis } from "../lib/live-types";
import { settleAnalysis } from "../lib/settle";

const analysis: LiveAnalysis = {
  id: "00000000-0000-4000-8000-000000000000",
  createdAt: "2026-06-13T00:00:00.000Z",
  ticker: "NVDA",
  event: "Test event",
  aiMode: "local-rules",
  market: {
    ticker: "NVDA", symbol: "NVDAUSDT", lastPrice: 100, markPrice: 100,
    indexPrice: 100, bid: 99.9, ask: 100.1, fundingRate: 0, change24h: 0,
    high24h: 102, low24h: 98, baseVolume: 1000, quoteVolume: 100000,
    openInterest: 5000, timestamp: "2026-06-13T00:00:00.000Z"
  },
  positionValue: 10000,
  maxLoss: 500,
  eventScore: -0.5,
  volatility: 0.01,
  shadowLow: 94,
  shadowHigh: 98,
  confidence: 0.8,
  expectedMove: -0.04,
  crossMarket: { traditionalMarket: "closed", pricingMode: "off-hours-internal", markIndexDivergence: 0, bidAskSpread: 0.002, signalQuality: 0.7, signalLabel: "usable" },
  riskLevel: "high",
  hedgeRatio: 0.6,
  hedgeNotional: 6000,
  hedgeSize: 60,
  estimatedTailLoss: 400,
  unhedgedTailLoss: 1000,
  estimatedLossAvoided: 600,
  reasoning: "Test",
  causalChain: ["A", "B", "C"],
  evidence: ["Market"],
  commitment: "hash"
};

test("settlement calculates hedge protection on a downside move", () => {
  const result = settleAnalysis(analysis, 95);
  assert.equal(result.intervalHit, true);
  assert.equal(result.rawReturn, -0.05);
  assert.equal(result.unhedgedPnl, -500);
  assert.equal(result.hedgedPnl, -200);
  assert.equal(result.lossAvoided, 300);
});

test("settlement exposes hedge drag on an upside move", () => {
  const result = settleAnalysis(analysis, 105);
  assert.equal(result.intervalHit, false);
  assert.equal(result.unhedgedPnl, 500);
  assert.equal(result.hedgedPnl, 200);
  assert.equal(result.lossAvoided, -300);
});
