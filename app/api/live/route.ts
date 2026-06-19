import { NextRequest, NextResponse } from "next/server";
import { getAgentHubSnapshot } from "@/lib/market-data";

export const runtime = "nodejs";
const SUPPORTED_TICKERS = new Set(["NVDA", "TSLA", "AAPL", "MSFT", "META", "SAMSUNG"]);

export async function GET(request: NextRequest) {
  try {
    const ticker = (request.nextUrl.searchParams.get("ticker") || "NVDA").toUpperCase();
    if (!SUPPORTED_TICKERS.has(ticker)) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
    return NextResponse.json(await getAgentHubSnapshot(ticker));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Live data failed" }, { status: 502 });
  }
}
