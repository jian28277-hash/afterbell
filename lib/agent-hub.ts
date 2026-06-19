import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { join } from "node:path";
import type { LiveTicker } from "./live-types";
import { saveAgentHubCall } from "./db";

const runFile = promisify(execFile);
const BGC_PATH = process.env.BITGET_BGC_PATH || "/opt/homebrew/bin/bgc";
const BGC_PROXY_LOADER = join(process.cwd(), "scripts", "bgc-proxy-loader.mjs");
const DEFAULT_PROXY = process.env.BITGET_PROXY_URL || "http://127.0.0.1:10808";

type HubPayload<T> = { endpoint: string; requestTime: string; data: T };

async function runAgentHub<T>(ticker: string, action: string, args: string[]) {
  const startedAt = Date.now();
  const symbol = `${ticker.toUpperCase()}USDT`;
  const command = `bgc futures ${action} ${args.join(" ")}`;
  try {
    let stdout = "";
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        ({ stdout } = await runFile(BGC_PATH, ["futures", action, ...args], {
          timeout: 10_000,
          maxBuffer: 2 * 1024 * 1024,
          env: {
            ...process.env,
            HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy || DEFAULT_PROXY,
            HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy || DEFAULT_PROXY,
            http_proxy: process.env.http_proxy || process.env.HTTP_PROXY || DEFAULT_PROXY,
            https_proxy: process.env.https_proxy || process.env.HTTPS_PROXY || DEFAULT_PROXY,
            NO_PROXY: process.env.NO_PROXY || process.env.no_proxy || "127.0.0.1,localhost",
            no_proxy: process.env.no_proxy || process.env.NO_PROXY || "127.0.0.1,localhost",
            NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=${BGC_PROXY_LOADER}`.trim()
          }
        }));
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
    if (lastError) throw lastError;
    const payload = JSON.parse(stdout) as HubPayload<T>;
    const record = saveAgentHubCall({
      at: new Date().toISOString(), skill: "bitget", command, endpoint: payload.endpoint,
      ticker: ticker.toUpperCase(), symbol, success: true, latencyMs: Date.now() - startedAt,
      responseHash: createHash("sha256").update(stdout).digest("hex")
    });
    return { data: payload.data, callId: record.id };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Agent Hub call failed";
    const endpoint = action === "futures_get_ticker" ? "GET /api/v2/mix/market/ticker" : "GET /api/v2/mix/market/candles";
    const record = saveAgentHubCall({
      at: new Date().toISOString(), skill: "bitget", command, endpoint,
      ticker: ticker.toUpperCase(), symbol, success: false, latencyMs: Date.now() - startedAt,
      error: detail.slice(0, 1000)
    });
    throw Object.assign(new Error(detail), { agentHubCallId: record.id });
  }
}

export async function getAgentHubTicker(ticker: string) {
  const symbol = `${ticker.toUpperCase()}USDT`;
  const result = await runAgentHub<Array<Record<string, string>>>(ticker, "futures_get_ticker", ["--productType", "USDT-FUTURES", "--symbol", symbol]);
  const item = result.data[0];
  if (!item) throw new Error(`Agent Hub returned no ticker for ${symbol}`);
  const market: LiveTicker = {
    ticker: ticker.toUpperCase(), symbol, lastPrice: Number(item.lastPr), markPrice: Number(item.markPrice),
    indexPrice: Number(item.indexPrice), bid: Number(item.bidPr), ask: Number(item.askPr),
    fundingRate: Number(item.fundingRate), change24h: Number(item.change24h), high24h: Number(item.high24h),
    low24h: Number(item.low24h), baseVolume: Number(item.baseVolume), quoteVolume: Number(item.quoteVolume),
    openInterest: Number(item.holdingAmount), timestamp: new Date(Number(item.ts)).toISOString()
  };
  return { market, callId: result.callId };
}

export async function getAgentHubCandles(ticker: string, limit = 48) {
  const symbol = `${ticker.toUpperCase()}USDT`;
  const result = await runAgentHub<string[][]>(ticker, "futures_get_candles", [
    "--productType", "USDT-FUTURES", "--symbol", symbol, "--granularity", "1h", "--limit", String(limit)
  ]);
  return {
    candles: result.data.map((row) => ({ time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]) })),
    callId: result.callId
  };
}
