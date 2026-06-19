import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAgentHubTicker } from "@/lib/agent-hub";
import { getAnalysis, saveSettlement } from "@/lib/db";
import { settleAnalysis } from "@/lib/settle";

export const runtime = "nodejs";

const schema = z.object({ analysisId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const { analysisId } = schema.parse(await request.json());
    const analysis = getAnalysis(analysisId);
    if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    const current = await getAgentHubTicker(analysis.ticker);
    const settlement = settleAnalysis(analysis, current.market.markPrice);
    saveSettlement(settlement);
    return NextResponse.json(settlement);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Settlement failed" }, { status: 400 });
  }
}
