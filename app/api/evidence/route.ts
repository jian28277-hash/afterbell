import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getHistory } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const history = getHistory();
  const analyses = history.analyses.filter((item) => item.agentHub?.runtime === "bitget-agent-hub");
  const analysisIds = new Set(analyses.map((item) => item.id));
  const orders = history.orders.filter((item) => analysisIds.has(item.analysisId));
  const settlements = history.settlements.filter((item) => analysisIds.has(item.analysisId));
  const calls = history.agentHubCalls;
  const payload = {
    project: "AFTERBELL",
    track: "Stock AI Trading",
    policy: "Agent Hub strict mode; no direct market-data REST fallback",
    generatedAt: new Date().toISOString(),
    summary: {
      agentHubCalls: calls.length,
      successfulAgentHubCalls: calls.filter((item) => item.success).length,
      newsBriefingCalls: calls.filter((item) => item.skill === "news-briefing").length,
      newsRiskAnalyses: analyses.filter((item) => item.newsRisk).length,
      strictAnalyses: analyses.length,
      strictPaperOrders: orders.length,
      strictSettlements: settlements.length,
      demoExecutionRuns: history.demoExecutions.length,
      completedDemoRoundTrips: history.demoExecutions.filter((item) => item.status === "completed").length
    },
    agentHubCalls: calls,
    analyses,
    paperOrders: orders,
    demoExecutionRuns: history.demoExecutions,
    settlements
  };
  return NextResponse.json({
    ...payload,
    evidenceHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex")
  });
}
