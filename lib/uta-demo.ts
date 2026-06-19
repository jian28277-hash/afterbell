import { createHmac, randomUUID } from "node:crypto";
import { externalFetch } from "./http";
import { saveDemoExecutionRun } from "./db";
import type { DemoExecutionRun, DemoExecutionStatus } from "./live-types";

const BASE_URL = "https://api.bitget.com";
const SYMBOL = "SAMSUNGUSDT" as const;
const CATEGORY = "USDT-FUTURES" as const;

type ApiResponse<T> = {
  code: string;
  msg: string;
  requestTime: number;
  data: T;
};

type Instrument = {
  symbol: string;
  status: string;
  symbolType: string;
  isRwa: string;
  minOrderQty: string;
  minOrderAmount: string;
  maxMarketOrderQty?: string;
  maxPositionNum?: string;
  quantityPrecision: string;
};

type Ticker = { markPrice: string; ask1Price: string };
type Settings = { holdMode: string };
type Assets = {
  accountEquity: string;
  assets: Array<{ coin: string; available: string }>;
};
type Position = {
  total: string;
  available: string;
  posSide: string;
  marginMode: string;
  leverage?: string;
  avgPrice?: string;
};
type OrderInfo = {
  orderId: string;
  orderStatus: string;
  cumExecQty: string;
  avgPrice: string;
  feeDetail?: Array<{ feeCoin: string; fee: string }>;
};

function hasCredentials() {
  return Boolean(process.env.BITGET_API_KEY && process.env.BITGET_SECRET_KEY && process.env.BITGET_PASSPHRASE);
}

async function request<T>(method: "GET" | "POST", path: string, bodyObject?: Record<string, unknown>, authenticated = true) {
  const body = bodyObject ? JSON.stringify(bodyObject) : "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    locale: "zh-CN",
    paptrading: "1"
  };
  if (authenticated) {
    if (!hasCredentials()) throw new Error("Bitget Demo API Key 尚未配置");
    const timestamp = Date.now().toString();
    headers["ACCESS-KEY"] = process.env.BITGET_API_KEY!;
    headers["ACCESS-SIGN"] = createHmac("sha256", process.env.BITGET_SECRET_KEY!)
      .update(`${timestamp}${method}${path}${body}`)
      .digest("base64");
    headers["ACCESS-PASSPHRASE"] = process.env.BITGET_PASSPHRASE!;
    headers["ACCESS-TIMESTAMP"] = timestamp;
  }
  const response = await externalFetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body || undefined,
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await response.json() as ApiResponse<T>;
  if (!response.ok || payload.code !== "00000") throw new Error(`Bitget UTA V3 ${payload.code}: ${payload.msg}`);
  return payload.data;
}

function feeTotal(order: OrderInfo) {
  return Math.abs((order.feeDetail || []).reduce((sum, item) => sum + Number(item.fee || 0), 0));
}

function availableUsdt(assets: Assets) {
  return Number(assets.assets.find((item) => item.coin === "USDT")?.available || 0);
}

function roundDown(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.floor(value * factor) / factor;
}

async function waitForOrder(orderId: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const order = await request<OrderInfo>("GET", `/api/v3/trade/order-info?orderId=${encodeURIComponent(orderId)}`);
    if (order.orderStatus === "filled") return order;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`模拟订单 ${orderId} 未在预期时间内成交`);
}

async function getPosition() {
  const data = await request<{ list: Position[] | null }>("GET", `/api/v3/position/current-position?category=${CATEGORY}&symbol=${SYMBOL}`);
  return data.list?.[0];
}

async function getPositions() {
  const data = await request<{ list: Position[] | null }>("GET", `/api/v3/position/current-position?category=${CATEGORY}&symbol=${SYMBOL}`);
  return data.list || [];
}

export async function getDemoExecutionStatus(): Promise<DemoExecutionStatus> {
  const checkedAt = new Date().toISOString();
  if (!hasCredentials()) {
    return { configured: false, api: "Bitget UTA V3 Demo", symbol: SYMBOL, instrumentOnline: false, checkedAt };
  }
  const [instruments, tickers, settings, assets, position] = await Promise.all([
    request<Instrument[]>("GET", `/api/v3/market/instruments?category=${CATEGORY}&symbol=${SYMBOL}`, undefined, false),
    request<Ticker[]>("GET", `/api/v3/market/tickers?category=${CATEGORY}&symbol=${SYMBOL}`, undefined, false),
    request<Settings>("GET", "/api/v3/account/settings"),
    request<Assets>("GET", "/api/v3/account/assets"),
    getPosition()
  ]);
  const instrument = instruments[0];
  const ticker = tickers[0];
  const usdt = assets.assets.find((item) => item.coin === "USDT");
  return {
    configured: true,
    api: "Bitget UTA V3 Demo",
    symbol: SYMBOL,
    instrumentOnline: instrument?.status === "online",
    symbolType: instrument?.symbolType,
    isRwa: instrument?.isRwa,
    markPrice: Number(ticker?.markPrice || 0),
    minOrderQty: Number(instrument?.minOrderQty || 0),
    minOrderAmount: Number(instrument?.minOrderAmount || 0),
    accountEquity: Number(assets.accountEquity || 0),
    availableBalance: Number(usdt?.available || 0),
    holdMode: settings.holdMode,
    currentPositionSize: Number(position?.total || 0),
    checkedAt
  };
}

export async function placeSamsungDemoShortHedge(size: number, clientOid: string) {
  if (size <= 0) throw new Error("对冲数量必须大于 0");
  const [status, settings, positions, instruments] = await Promise.all([
    getDemoExecutionStatus(),
    request<Settings>("GET", "/api/v3/account/settings"),
    getPositions(),
    request<Instrument[]>("GET", `/api/v3/market/instruments?category=${CATEGORY}&symbol=${SYMBOL}`, undefined, false)
  ]);
  if (!status.configured) throw new Error("Bitget Demo API Key 尚未配置");
  if (!status.instrumentOnline) throw new Error(`${SYMBOL} 当前未在 Demo 产品目录上线`);
  const existingShort = positions.find((position) => position.posSide === "short" && Number(position.total || 0) > 0);
  if (existingShort) {
    return {
      orderId: `existing-${SYMBOL}-${Date.now()}`,
      quantity: Number(existingShort.total || 0),
      avgPrice: Number(existingShort.avgPrice || status.markPrice || 0),
      fee: 0,
      holdMode: settings.holdMode,
      leverage: Number(existingShort.leverage || 0) || undefined
    };
  }
  const existing = positions.find((position) => Math.abs(Number(position.total || 0)) > 0);
  if (existing) throw new Error(`${SYMBOL} Demo 账户已有非空头持仓，请先处理后再运行真实对冲测试`);
  const instrument = instruments[0];
  const precision = Number(instrument?.quantityPrecision ?? 2);
  const markPrice = status.markPrice || 0;
  const minQuantityByAmount = markPrice > 0
    ? Math.ceil(((status.minOrderAmount || 5) / markPrice) * (10 ** precision)) / (10 ** precision)
    : status.minOrderQty || 0.01;
  const minQuantity = Math.max(status.minOrderQty || 0.01, minQuantityByAmount);
  const exchangeCap = Math.min(
    Number(instrument?.maxMarketOrderQty || Number.POSITIVE_INFINITY),
    Number(instrument?.maxPositionNum || Number.POSITIVE_INFINITY)
  );
  // SAMSUNGUSDT demo stock futures currently reject large notional hedge tests by tier.
  // Use a small real order so execution is verifiable without tripping demo risk limits.
  const demoSafetyCap = Math.min(Number.isFinite(exchangeCap) ? exchangeCap : 1, 1);
  const quantity = Math.max(minQuantity, roundDown(Math.min(size, demoSafetyCap), precision));
  const body: Record<string, unknown> = {
    category: CATEGORY,
    symbol: SYMBOL,
    qty: quantity.toFixed(2),
    side: "sell",
    orderType: "market",
    marginMode: "crossed",
    clientOid: clientOid.slice(0, 32)
  };
  if (settings.holdMode === "hedge_mode") body.posSide = "short";
  const opened = await request<{ orderId: string }>("POST", "/api/v3/trade/place-order", body);
  const order = await waitForOrder(opened.orderId);
  return {
    orderId: order.orderId,
    quantity: Number(order.cumExecQty || quantity),
    avgPrice: Number(order.avgPrice || status.markPrice || 0),
    fee: feeTotal(order),
    holdMode: settings.holdMode,
    leverage: Number((await getPositions()).find((position) => position.posSide === "short")?.leverage || 0) || undefined
  };
}

export async function closeSamsungDemoShortHedge(size: number, clientOid: string) {
  const [settings, positions] = await Promise.all([
    request<Settings>("GET", "/api/v3/account/settings"),
    getPositions()
  ]);
  const shortPosition = positions.find((position) => position.posSide === "short" && Number(position.total || 0) > 0)
    || positions.find((position) => Number(position.total || 0) > 0);
  if (!shortPosition) throw new Error(`${SYMBOL} Demo 账户没有可关闭的对冲空单`);
  const closeQuantity = Math.min(size, Number(shortPosition.available || shortPosition.total || 0));
  if (closeQuantity <= 0) throw new Error(`${SYMBOL} 当前对冲仓位没有可用数量`);
  const body: Record<string, unknown> = {
    category: CATEGORY,
    symbol: SYMBOL,
    qty: closeQuantity.toFixed(2),
    side: "buy",
    orderType: "market",
    marginMode: shortPosition.marginMode || "crossed",
    clientOid: clientOid.slice(0, 32)
  };
  if (settings.holdMode === "hedge_mode") body.posSide = "short";
  else body.reduceOnly = "yes";
  const closed = await request<{ orderId: string }>("POST", "/api/v3/trade/place-order", body);
  const order = await waitForOrder(closed.orderId);
  const remainingPositions = await getPositions();
  const remainingShort = remainingPositions.find((position) => position.posSide === "short" && Number(position.total || 0) > 0);
  if (remainingShort) throw new Error(`${SYMBOL} Demo 空单平仓后仍有 ${remainingShort.total} 张残留仓位`);
  return {
    orderId: order.orderId,
    quantity: Number(order.cumExecQty || closeQuantity),
    avgPrice: Number(order.avgPrice || 0),
    fee: feeTotal(order),
    leverage: Number(shortPosition.leverage || 0) || undefined
  };
}

export async function executeDemoRoundTrip(): Promise<DemoExecutionRun> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  let run: DemoExecutionRun = {
    id, createdAt, completedAt: createdAt, symbol: SYMBOL, category: CATEGORY,
    environment: "bitget-uta-v3-demo", status: "open-failed", holdMode: "unknown",
    quantity: 0, balanceBefore: 0, balanceAfter: 0, balanceChange: 0
  };
  let openOrder: OrderInfo | undefined;
  try {
    const [status, settings, assetsBefore, tickers] = await Promise.all([
      getDemoExecutionStatus(),
      request<Settings>("GET", "/api/v3/account/settings"),
      request<Assets>("GET", "/api/v3/account/assets"),
      request<Ticker[]>("GET", `/api/v3/market/tickers?category=${CATEGORY}&symbol=${SYMBOL}`, undefined, false)
    ]);
    if (!status.instrumentOnline) throw new Error(`${SYMBOL} 当前未在 Demo 产品目录上线`);
    if ((status.currentPositionSize || 0) !== 0) throw new Error(`${SYMBOL} 已有持仓，请先清空后再运行往返测试`);
    const ask = Number(tickers[0]?.ask1Price || status.markPrice || 0);
    const minimumByAmount = Math.ceil(((status.minOrderAmount || 5) / ask) * 100) / 100;
    const quantity = Math.max(status.minOrderQty || 0.01, minimumByAmount);
    const balanceBefore = availableUsdt(assetsBefore);
    run = { ...run, holdMode: settings.holdMode, quantity, balanceBefore };
    const openBody: Record<string, unknown> = {
      category: CATEGORY, symbol: SYMBOL, qty: quantity.toFixed(2), side: "buy",
      orderType: "market", marginMode: "crossed", clientOid: `afterbell-open-${Date.now()}`.slice(0, 32)
    };
    if (settings.holdMode === "hedge_mode") openBody.posSide = "long";
    const opened = await request<{ orderId: string }>("POST", "/api/v3/trade/place-order", openBody);
    openOrder = await waitForOrder(opened.orderId);
    const position = await getPosition();
    const closeQuantity = Number(position?.available || position?.total || openOrder.cumExecQty);
    const closeBody: Record<string, unknown> = {
      category: CATEGORY, symbol: SYMBOL, qty: closeQuantity.toFixed(2), side: "sell",
      orderType: "market", marginMode: position?.marginMode || "crossed",
      clientOid: `afterbell-close-${Date.now()}`.slice(0, 32)
    };
    if (settings.holdMode === "hedge_mode") closeBody.posSide = "long";
    else closeBody.reduceOnly = "yes";
    const closed = await request<{ orderId: string }>("POST", "/api/v3/trade/place-order", closeBody);
    const closeOrder = await waitForOrder(closed.orderId);
    const [assetsAfter, finalPosition] = await Promise.all([
      request<Assets>("GET", "/api/v3/account/assets"),
      getPosition()
    ]);
    const balanceAfter = availableUsdt(assetsAfter);
    const openPrice = Number(openOrder.avgPrice);
    const closePrice = Number(closeOrder.avgPrice);
    const openFee = feeTotal(openOrder);
    const closeFee = feeTotal(closeOrder);
    run = {
      ...run, completedAt: new Date().toISOString(), status: "completed",
      balanceAfter, balanceChange: balanceAfter - balanceBefore,
      openOrderId: openOrder.orderId, openPrice, openFee,
      closeOrderId: closeOrder.orderId, closePrice, closeFee,
      realizedPnl: (closePrice - openPrice) * quantity - openFee - closeFee,
      finalPositionSize: Number(finalPosition?.total || 0)
    };
  } catch (error) {
    const position = openOrder ? await getPosition().catch(() => undefined) : undefined;
    run = {
      ...run, completedAt: new Date().toISOString(),
      status: openOrder ? "close-failed" : "open-failed",
      openOrderId: openOrder?.orderId,
      openPrice: openOrder ? Number(openOrder.avgPrice) : undefined,
      openFee: openOrder ? feeTotal(openOrder) : undefined,
      finalPositionSize: Number(position?.total || 0),
      error: error instanceof Error ? error.message : "Demo 往返测试失败"
    };
  }
  saveDemoExecutionRun(run);
  return run;
}
