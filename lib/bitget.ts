import { createHmac } from "node:crypto";
import type { LiveTicker } from "./live-types";
import { externalFetch } from "./http";
import { buildCrossMarketSignal } from "./market-session";
import { saveBitgetApiCall } from "./db";

const BASE_URL = "https://api.bitget.com";

type BitgetResponse<T> = { code: string; msg: string; data: T };

async function bitgetGet<T>(path: string, ticker: string, endpoint: string): Promise<T> {
  const startedAt = Date.now();
  const symbol = `${ticker.toUpperCase()}USDT`;
  try {
    const response = await externalFetch(`${BASE_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const payload = (await response.json()) as BitgetResponse<T>;
    const success = response.ok && payload.code === "00000";
    saveBitgetApiCall({ at: new Date().toISOString(), endpoint, ticker: ticker.toUpperCase(), symbol, status: response.status, success, latencyMs: Date.now() - startedAt, error: success ? undefined : `${payload.code}: ${payload.msg}` });
    if (!success) throw new Error(`Bitget ${payload.code}: ${payload.msg}`);
    return payload.data;
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("Bitget "))) {
      saveBitgetApiCall({ at: new Date().toISOString(), endpoint, ticker: ticker.toUpperCase(), symbol, status: 0, success: false, latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Request failed" });
    }
    throw error;
  }
}

export async function getLiveTicker(ticker: string): Promise<LiveTicker> {
  const symbol = `${ticker.toUpperCase()}USDT`;
  const data = await bitgetGet<Array<Record<string, string>>>(
    `/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=${symbol}`, ticker, "mix/market/ticker"
  );
  const item = data[0];
  if (!item) throw new Error(`No Bitget stock-futures ticker for ${symbol}`);
  return {
    ticker: ticker.toUpperCase(),
    symbol,
    lastPrice: Number(item.lastPr),
    markPrice: Number(item.markPrice),
    indexPrice: Number(item.indexPrice),
    bid: Number(item.bidPr),
    ask: Number(item.askPr),
    fundingRate: Number(item.fundingRate),
    change24h: Number(item.change24h),
    high24h: Number(item.high24h),
    low24h: Number(item.low24h),
    baseVolume: Number(item.baseVolume),
    quoteVolume: Number(item.quoteVolume),
    openInterest: Number(item.holdingAmount),
    timestamp: new Date(Number(item.ts)).toISOString()
  };
}

export function getCrossMarketSignal(ticker: LiveTicker) {
  return buildCrossMarketSignal(ticker);
}

export async function getCandles(ticker: string, limit = 48) {
  const symbol = `${ticker.toUpperCase()}USDT`;
  const data = await bitgetGet<string[][]>(
    `/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1H&limit=${limit}`, ticker, "mix/market/candles"
  );
  return data.map((row) => ({
    time: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4])
  }));
}

export function hasDemoCredentials() {
  return Boolean(
    process.env.BITGET_DEMO_CONFIRMED === "true" &&
    process.env.BITGET_API_KEY &&
    process.env.BITGET_SECRET_KEY &&
    process.env.BITGET_PASSPHRASE
  );
}

const STOCK_FUTURES = new Set(["NVDAUSDT", "TSLAUSDT", "AAPLUSDT", "MSFTUSDT", "METAUSDT", "SAMSUNGUSDT"]);

export function supportsDemoOrder(symbol: string) {
  return hasDemoCredentials() && !STOCK_FUTURES.has(symbol.toUpperCase());
}

export async function placeDemoHedge(symbol: string, size: number, clientOid: string) {
  if (!hasDemoCredentials()) throw new Error("Bitget Demo credentials are not configured");
  if (!supportsDemoOrder(symbol)) throw new Error("Bitget Demo does not support stock-futures orders; use the local paper ledger");
  const path = "/api/v2/mix/order/place-order";
  const body = JSON.stringify({
    symbol,
    productType: "USDT-FUTURES",
    marginMode: "isolated",
    marginCoin: "USDT",
    size: size.toFixed(4),
    side: "sell",
    tradeSide: "open",
    orderType: "market",
    clientOid
  });
  const timestamp = Date.now().toString();
  const prehash = `${timestamp}POST${path}${body}`;
  const signature = createHmac("sha256", process.env.BITGET_SECRET_KEY!)
    .update(prehash)
    .digest("base64");
  const response = await externalFetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ACCESS-KEY": process.env.BITGET_API_KEY!,
      "ACCESS-SIGN": signature,
      "ACCESS-PASSPHRASE": process.env.BITGET_PASSPHRASE!,
      "ACCESS-TIMESTAMP": timestamp,
      paptrading: "1",
      locale: "en-US"
    },
    body,
    signal: AbortSignal.timeout(15_000)
  });
  const payload = (await response.json()) as BitgetResponse<{ orderId: string; clientOid: string }>;
  if (!response.ok || payload.code !== "00000") {
    throw new Error(`Bitget Demo ${payload.code}: ${payload.msg}`);
  }
  return payload.data;
}
