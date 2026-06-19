import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAutopilotPortfolio, runAutopilotTick, runPortfolioTick, startAutopilot, stopAutopilot } from "@/lib/autopilot";

export const runtime = "nodejs";

const schedulerState = globalThis as typeof globalThis & {
  afterbellScheduler?: ReturnType<typeof setInterval>;
  afterbellTickRunning?: boolean;
};
const SUPPORTED_TICKERS = ["NVDA", "TSLA", "AAPL", "MSFT", "META", "SAMSUNG"] as const;
const tickerSchema = z.enum(SUPPORTED_TICKERS);

function ensureAutopilotScheduler() {
  if (schedulerState.afterbellScheduler) return;
  schedulerState.afterbellScheduler = setInterval(async () => {
    if (schedulerState.afterbellTickRunning) return;
    const due = getAutopilotPortfolio().strategies.filter((item) =>
      item.enabled && (!item.nextCheckAt || new Date(item.nextCheckAt).getTime() <= Date.now())
    );
    if (!due.length) return;
    schedulerState.afterbellTickRunning = true;
    try {
      await Promise.all(due.map((item) => runAutopilotTick(item.ticker)));
    } finally {
      schedulerState.afterbellTickRunning = false;
    }
  }, 5_000);
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), ticker: tickerSchema, positionValue: z.number().positive(), maxLoss: z.number().positive(), anomalyThreshold: z.number().min(0.001).max(0.1) }),
  z.object({ action: z.literal("start_many"), strategies: z.array(z.object({ ticker: tickerSchema, positionValue: z.number().positive(), maxLoss: z.number().positive(), anomalyThreshold: z.number().min(0.001).max(0.1) })).min(1).max(10) }),
  z.object({ action: z.literal("stop"), ticker: tickerSchema }),
  z.object({ action: z.literal("stop_all") }),
  z.object({ action: z.literal("tick"), ticker: tickerSchema.optional() })
]);

export async function GET() {
  ensureAutopilotScheduler();
  return NextResponse.json(getAutopilotPortfolio());
}

export async function POST(request: NextRequest) {
  try {
    ensureAutopilotScheduler();
    const input = schema.parse(await request.json());
    if (input.action === "stop") return NextResponse.json({ strategy: stopAutopilot(input.ticker), portfolio: getAutopilotPortfolio() });
    if (input.action === "stop_all") {
      for (const strategy of getAutopilotPortfolio().strategies.filter((item) => item.enabled && !item.activeOrderId)) stopAutopilot(strategy.ticker);
      return NextResponse.json(getAutopilotPortfolio());
    }
    if (input.action === "start") {
      const { ticker, positionValue, maxLoss, anomalyThreshold } = input;
      startAutopilot({ ticker, positionValue, maxLoss, anomalyThreshold });
      return NextResponse.json(await runAutopilotTick(ticker));
    }
    if (input.action === "start_many") {
      for (const strategy of input.strategies) startAutopilot(strategy);
      const results = await Promise.all(input.strategies.map((strategy) => runAutopilotTick(strategy.ticker)));
      return NextResponse.json({ ...getAutopilotPortfolio(), results });
    }
    return NextResponse.json(input.ticker ? await runAutopilotTick(input.ticker) : await runPortfolioTick());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Autopilot failed" }, { status: 400 });
  }
}
