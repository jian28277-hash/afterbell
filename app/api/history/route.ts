import { NextResponse } from "next/server";
import { getHistory } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getHistory());
}
