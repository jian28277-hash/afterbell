import { z } from "zod";
import type { NewsItem } from "./live-types";

const qwenResult = z.object({
  eventScore: z.number().min(-1).max(1),
  confidence: z.number().min(0.35).max(0.95),
  reasoning: z.string().min(10).max(700),
  causalChain: z.array(z.string()).min(3).max(6),
  evidence: z.array(z.string()).min(1).max(6)
});
const newsRiskResult = z.object({
  severity: z.enum(["none", "low", "medium", "high", "critical"]),
  direction: z.enum(["negative", "neutral", "positive"]),
  scope: z.enum(["company", "sector", "macro"]).default("company"),
  affectedTickers: z.array(z.enum(["NVDA", "TSLA", "AAPL", "MSFT", "META", "SAMSUNG"])).default([]),
  confidence: z.number().min(0).max(0.95),
  requiresMarketConfirmation: z.boolean(),
  summary: z.string().min(5).max(400),
  headline: z.string().max(300).optional()
});

export function hasQwen() {
  return Boolean(process.env.BITGET_QWEN_API_KEY);
}

function extractResponseText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const block of content as Array<Record<string, unknown>>) {
      if (typeof block.text === "string") return block.text;
    }
  }
  throw new Error("Qwen response did not contain text output");
}

export async function analyzeWithQwen(input: Record<string, unknown>) {
  if (!hasQwen()) return null;
  const baseUrl = process.env.QWEN_BASE_URL || "https://hackathon.bitgetops.com/v1";
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.BITGET_QWEN_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.QWEN_MODEL || "qwen3.6-plus",
      temperature: 0.2,
      max_output_tokens: 700,
      input: `Return one compact JSON object only. Schema: {"eventScore":number from -1 to 1,"confidence":number from 0.35 to 0.95,"reasoning":string under 240 chars,"causalChain":array of 3-5 short strings,"evidence":array of 1-5 short strings}. All explanatory strings must use Simplified Chinese. Never invent prices. Verified input: ${JSON.stringify(input)}`
    }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!response.ok) throw new Error(`Qwen returned HTTP ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const text = extractResponseText(payload).replace(/^```json\s*|\s*```$/g, "");
  return qwenResult.parse(JSON.parse(text));
}

export async function analyzeNewsRiskWithQwen(ticker: string, items: NewsItem[]) {
  if (!hasQwen() || !items.length) return { severity: "none" as const, direction: "neutral" as const, confidence: 0, requiresMarketConfirmation: true, summary: "当前没有匹配的 Agent Hub 新闻标题。" };
  const baseUrl = process.env.QWEN_BASE_URL || "https://hackathon.bitgetops.com/v1";
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.BITGET_QWEN_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.QWEN_MODEL || "qwen3.6-plus", temperature: 0.1, max_output_tokens: 500,
      input: `Classify news risk for ${ticker}. Return JSON only: {"severity":"none|low|medium|high|critical","direction":"negative|neutral|positive","scope":"company|sector|macro","affectedTickers":["NVDA|TSLA|AAPL|MSFT|META|SAMSUNG"],"confidence":0..0.95,"requiresMarketConfirmation":boolean,"summary":"under 180 chars in Simplified Chinese","headline":"most relevant original headline"}.
Rules:
- company: only one clearly named company is affected.
- sector: industry-wide event, e.g. chip export controls affect NVDA/SAMSUNG; EV regulation affects TSLA.
- macro: broad market event, e.g. Fed/inflation/war/tariff/market crash.
- affectedTickers must list only tickers genuinely impacted. If scope=company, do not include unrelated companies. If unclear, choose company and include only explicitly named ticker.
High or critical requires a credible event likely to affect the next US cash open. Routine commentary must be low or none. News: ${JSON.stringify(items)}`
    }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!response.ok) throw new Error(`Qwen news analysis returned HTTP ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  return newsRiskResult.parse(JSON.parse(extractResponseText(payload).replace(/^```json\s*|\s*```$/g, "")));
}
