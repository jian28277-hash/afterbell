import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildAnalysis } from "@/lib/analyze";
import { getAgentHubSnapshot } from "@/lib/market-data";
import { saveAnalysis } from "@/lib/db";

export const runtime = "nodejs";

const inputSchema = z.object({
  ticker: z.string().regex(/^[A-Z]{1,5}$/),
  event: z.string().min(8).max(1200),
  positionValue: z.number().positive().max(10_000_000),
  maxLoss: z.number().positive().max(1_000_000)
});

export async function POST(request: NextRequest) {
  try {
    const input = inputSchema.parse(await request.json());
    const analysis = await buildAnalysis(await getAgentHubSnapshot(input.ticker), input.event, input.positionValue, input.maxLoss);
    saveAnalysis(analysis);
    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
