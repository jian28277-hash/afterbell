import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncSamsungDemoPosition } from "@/lib/autopilot";
import { getDemoExecutionRuns } from "@/lib/db";
import { closeSamsungDemoShortHedge, executeDemoRoundTrip, getDemoExecutionStatus } from "@/lib/uta-demo";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("round_trip"),
    symbol: z.literal("SAMSUNGUSDT"),
    confirmDemo: z.literal(true)
  }),
  z.object({
    action: z.literal("close_short"),
    symbol: z.literal("SAMSUNGUSDT"),
    confirmDemo: z.literal(true)
  })
]);

export async function GET() {
  try {
    const synced = await syncSamsungDemoPosition();
    return NextResponse.json({
      status: synced.status,
      runs: getDemoExecutionRuns(50)
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "无法读取 Bitget Demo 状态",
      runs: getDemoExecutionRuns(50)
    }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    if (input.action === "close_short") {
      const closed = await closeSamsungDemoShortHedge(Number.MAX_SAFE_INTEGER, `afterbell-orphan-close-${Date.now()}`);
      return NextResponse.json({
        closed,
        status: await getDemoExecutionStatus(),
        runs: getDemoExecutionRuns(50)
      });
    }
    const run = await executeDemoRoundTrip();
    return NextResponse.json({
      run,
      status: await getDemoExecutionStatus(),
      runs: getDemoExecutionRuns(50)
    }, { status: run.status === "completed" ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Demo 往返测试失败",
      runs: getDemoExecutionRuns(50)
    }, { status: 400 });
  }
}
