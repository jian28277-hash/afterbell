import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { closeActiveHedge } from "@/lib/autopilot";

export const runtime = "nodejs";

const schema = z.object({
  ticker: z.enum(["NVDA", "TSLA", "AAPL", "MSFT", "META", "SAMSUNG"]),
  confirmClose: z.literal(true)
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    return NextResponse.json(await closeActiveHedge(input.ticker));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Close hedge failed" }, { status: 400 });
  }
}
