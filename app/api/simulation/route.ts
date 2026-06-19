import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clearSimulationScenario, getAutopilot, saveAutopilot, saveSimulationScenario } from "@/lib/db";
import { getAutopilotPortfolio, runAutopilotTick } from "@/lib/autopilot";
import { detectSimulationImpact } from "@/lib/simulation-impact";

export const runtime = "nodejs";

const tickerSchema = z.enum(["NVDA", "TSLA", "AAPL", "MSFT", "META", "SAMSUNG"]);
const strategySchema = z.object({
  ticker: tickerSchema,
  positionValue: z.number().positive().max(10_000_000),
  maxLoss: z.number().positive().max(1_000_000),
  anomalyThreshold: z.number().min(0.001).max(0.1)
});
const inputSchema = z.object({
  strategies: z.array(strategySchema).min(1).max(10),
  headline: z.string().min(8).max(180),
  kind: z.enum(["bearish", "bullish"]).default("bearish"),
  summary: z.string().min(8).max(600).optional()
});

export async function POST(request: NextRequest) {
  try {
    const input = inputSchema.parse(await request.json());
    const impact = detectSimulationImpact(input.headline, input.strategies.map((strategy) => strategy.ticker));
    const scenarios = [];
    const results = [];
    for (const strategy of input.strategies) {
      const now = new Date();
      const current = getAutopilot(strategy.ticker);
      if (!impact.affectedTickers.includes(strategy.ticker)) {
        results.push({
          ticker: strategy.ticker,
          ok: true,
          result: {
            config: current,
            trigger: "simulation-unaffected",
            reason: `${impact.scope === "unknown" ? "未识别到明确影响范围" : "公司级新闻未影响该标的"}，未启动策略、未开对冲。`
          }
        });
        continue;
      }
      const scenario = saveSimulationScenario({
        id: randomUUID(),
        ticker: strategy.ticker,
        headline: input.headline,
        summary: input.summary || (input.kind === "bullish"
          ? "本地模拟利好反转新闻，用于验证已有对冲能否自动取消；没有对冲时只记录，不开空。"
          : "本地模拟利空新闻，用于验证自动驾驶识别新闻风险、生成分析、建立对冲订单和保存证据的完整链路。"),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString()
      });
      scenarios.push(scenario);
      try {
        if (!current.enabled) {
          clearSimulationScenario(strategy.ticker);
          results.push({ ticker: strategy.ticker, ok: true, result: { config: current, trigger: "simulation-requires-autopilot" } });
          continue;
        }
        saveAutopilot({
          ...current,
          positionValue: strategy.positionValue,
          maxLoss: strategy.maxLoss,
          anomalyThreshold: strategy.anomalyThreshold,
          lastAction: "模拟新闻演练已接入，正在触发自动风险评估。"
        });
        results.push({ ticker: strategy.ticker, ok: true, result: await runAutopilotTick(strategy.ticker) });
      } catch (error) {
        results.push({ ticker: strategy.ticker, ok: false, error: error instanceof Error ? error.message : "Simulation failed" });
      }
    }
    return NextResponse.json({ scenarios, results, portfolio: getAutopilotPortfolio() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Simulation failed" }, { status: 400 });
  }
}
