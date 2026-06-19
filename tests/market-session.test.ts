import assert from "node:assert/strict";
import test from "node:test";
import { buildCrossMarketSignal, getNextMarketOpen, getTraditionalMarketState } from "../lib/market-session";

test("detects regular U.S. cash-market hours", () => {
  assert.equal(getTraditionalMarketState("2026-06-15T14:00:00.000Z"), "open");
  assert.equal(getTraditionalMarketState("2026-06-14T14:00:00.000Z"), "closed");
});

test("grades a liquid off-hours perp signal", () => {
  const signal = buildCrossMarketSignal({
    ticker: "NVDA", symbol: "NVDAUSDT", lastPrice: 205.7, markPrice: 205.7,
    indexPrice: 205.68, bid: 205.69, ask: 205.71, fundingRate: 0, change24h: 0.01,
    high24h: 206, low24h: 204, baseVolume: 10000, quoteVolume: 2_000_000,
    openInterest: 60_000, timestamp: "2026-06-14T14:00:00.000Z"
  });
  assert.equal(signal.traditionalMarket, "closed");
  assert.equal(signal.pricingMode, "off-hours-internal");
  assert.ok(signal.signalQuality > 0.7);
});

test("finds the next regular U.S. market open across a weekend", () => {
  const nextOpen = getNextMarketOpen("2026-06-14T14:00:00.000Z");
  assert.equal(nextOpen, "2026-06-15T13:30:00.000Z");
});
