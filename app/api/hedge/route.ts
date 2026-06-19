import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnalysis } from "@/lib/db";
import { createHedgeOrder } from "@/lib/hedge";

export const runtime = "nodejs";

const schema = z.object({ analysisId: z.string().uuid(), confirmDemo: z.literal(true) });

export async function POST(request: NextRequest) {
  try {
    const { analysisId } = schema.parse(await request.json());
    const analysis = getAnalysis(analysisId);
    if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    if (analysis.hedgeSize <= 0) return NextResponse.json({ error: "No hedge is required" }, { status: 400 });
    const order = await createHedgeOrder(analysis);
    return NextResponse.json(order);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hedge failed" }, { status: 400 });
  }
}
