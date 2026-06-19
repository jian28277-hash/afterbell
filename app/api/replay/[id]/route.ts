import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  _context: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({ error: "Replay disabled: AFTERBELL runs in Agent Hub strict mode." }, { status: 410 });
}
