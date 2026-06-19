import assert from "node:assert/strict";
import test from "node:test";
import { detectSimulationImpact } from "../lib/simulation-impact";

test("limits Samsung company news to Samsung", () => {
  const result = detectSimulationImpact("SAMSUNG 盘后突发重大监管调查，供应链订单被暂停", ["NVDA", "TSLA", "SAMSUNG"]);
  assert.deepEqual(result.affectedTickers, ["SAMSUNG"]);
  assert.equal(result.scope, "company");
});

test("lets macro news affect the selected portfolio", () => {
  const result = detectSimulationImpact("美股盘后遭遇宏观利率冲击，纳指期货快速走弱", ["NVDA", "TSLA", "SAMSUNG"]);
  assert.deepEqual(result.affectedTickers, ["NVDA", "TSLA", "SAMSUNG"]);
  assert.equal(result.scope, "macro");
});
