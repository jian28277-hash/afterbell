import assert from "node:assert/strict";
import test from "node:test";
import { assessNewsDecision } from "../lib/news-risk";

const risk = { severity: "high" as const, direction: "negative" as const, scope: "company" as const, affectedTickers: ["TSLA"], confidence: 0.86, requiresMarketConfirmation: true, summary: "Material negative event" };

test("waits for price confirmation when news requires it", () => {
  const result = assessNewsDecision(risk, -0.001, 0.001, 0.01, "TSLA");
  assert.equal(result.credibleNegative, true);
  assert.equal(result.newsTrigger, false);
});

test("triggers after market confirmation", () => {
  const result = assessNewsDecision(risk, -0.006, 0.006, 0.01, "TSLA");
  assert.equal(result.newsTrigger, true);
  assert.equal(result.chaseBlocked, false);
});

test("blocks chasing after a sharp fall", () => {
  const result = assessNewsDecision(risk, -0.025, 0.025, 0.01, "TSLA");
  assert.equal(result.newsTrigger, true);
  assert.equal(result.chaseBlocked, true);
});

test("does not spread company-specific news to unrelated tickers", () => {
  const result = assessNewsDecision(risk, -0.01, 0.01, 0.01, "AAPL");
  assert.equal(result.affected, false);
  assert.equal(result.credibleNegative, false);
  assert.equal(result.newsTrigger, false);
});

test("allows macro news to affect all tickers", () => {
  const macroRisk = { ...risk, scope: "macro" as const, affectedTickers: [] };
  const result = assessNewsDecision(macroRisk, -0.01, 0.01, 0.01, "AAPL");
  assert.equal(result.affected, true);
  assert.equal(result.newsTrigger, true);
});
