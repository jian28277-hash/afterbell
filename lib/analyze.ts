import { createHash, randomUUID } from "node:crypto";
import type { LiveAnalysis, LiveSnapshot } from "./live-types";
import { analyzeWithQwen } from "./qwen";

function standardDeviation(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function localEventAnalysis(event: string, snapshot: LiveSnapshot) {
  const lower = event.toLowerCase();
  const negative = ["restriction", "ban", "miss", "investigation", "lawsuit", "recall", "downgrade", "cuts", "risk"];
  const positive = ["beat", "approval", "partnership", "upgrade", "record", "growth", "launch"];
  const score = Math.max(-1, Math.min(1,
    positive.filter((word) => lower.includes(word)).length * 0.2 -
    negative.filter((word) => lower.includes(word)).length * 0.24
  ));
  return {
    eventScore: score || -0.08,
    confidence: Math.min(0.82, 0.48 + Math.abs(score) * 0.25 + snapshot.crossMarket.signalQuality * 0.18),
    reasoning: snapshot.crossMarket.traditionalMarket === "closed"
      ? `美股现货已经休市，因此系统按照 ${(snapshot.crossMarket.signalQuality * 100).toFixed(0)}% 的信号质量对 Bitget 合约波动进行加权。判断仅使用 Agent Hub 行情、K 线、价差、成交量、未平仓量及标记价与指数价偏差。`
      : "美股现货正在交易，因此系统完整采用 Bitget 标记价、指数价和小时波动率进行判断。",
    causalChain: ["识别美股现货交易状态", "评估休市时段信号质量", "映射公司事件风险", "估算下次开盘尾部亏损", "选择满足亏损预算的最小对冲"],
    evidence: ["Bitget 美股合约实时行情", "Bitget 1 小时 K 线", `Bitget 成交额 ${snapshot.market.quoteVolume.toFixed(2)}`, `Bitget 未平仓量 ${snapshot.market.openInterest.toFixed(2)}`, `标记价与指数价偏差 ${(snapshot.crossMarket.markIndexDivergence * 100).toFixed(3)}%`, `买卖价差 ${(snapshot.crossMarket.bidAskSpread * 100).toFixed(3)}%`]
  };
}

export async function buildAnalysis(snapshot: LiveSnapshot, event: string, positionValue: number, maxLoss: number, newsRisk?: LiveAnalysis["newsRisk"]): Promise<LiveAnalysis> {
  const closes = snapshot.candles.map((candle) => candle.close);
  const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index]));
  const hourlyVol = returns.length > 1 ? standardDeviation(returns) : 0.01;
  let qwen = null;
  try {
    qwen = await analyzeWithQwen({
      event,
      market: {
        ticker: snapshot.market.ticker,
        markPrice: snapshot.market.markPrice,
        indexPrice: snapshot.market.indexPrice,
        change24h: snapshot.market.change24h,
        high24h: snapshot.market.high24h,
        low24h: snapshot.market.low24h
      },
      bitgetMarketMetrics: {
        bid: snapshot.market.bid, ask: snapshot.market.ask, fundingRate: snapshot.market.fundingRate,
        baseVolume: snapshot.market.baseVolume, quoteVolume: snapshot.market.quoteVolume, openInterest: snapshot.market.openInterest
      },
      hourlyVol,
      crossMarket: snapshot.crossMarket,
      news: snapshot.news.items,
      newsRisk
    });
  } catch (error) {
    console.error("Qwen analysis fallback:", error instanceof Error ? error.message : error);
  }
  const eventAnalysis = qwen || localEventAnalysis(event, snapshot);
  const eventMove = eventAnalysis.eventScore * Math.max(0.012, hourlyVol * 3.2);
  const offHoursWeight = snapshot.crossMarket.traditionalMarket === "closed" ? snapshot.crossMarket.signalQuality : 1;
  const expectedMove = snapshot.market.change24h * offHoursWeight + eventMove;
  const disagreement = Math.abs(snapshot.market.markPrice - snapshot.market.indexPrice) / snapshot.market.indexPrice;
  const halfWidth = snapshot.market.markPrice * Math.max(0.006, hourlyVol * 2.1 + disagreement);
  const center = snapshot.market.markPrice * (1 + eventMove * 0.35);
  const shadowLow = center - halfWidth;
  const shadowHigh = center + halfWidth;
  const adverseMove = Math.max(Math.abs((shadowLow - snapshot.market.markPrice) / snapshot.market.markPrice), hourlyVol * 2.5);
  const unhedgedTailLoss = positionValue * adverseMove;
  const hedgeRatio = unhedgedTailLoss <= maxLoss ? 0 : Math.min(1, Math.max(0, 1 - maxLoss / unhedgedTailLoss));
  const hedgeNotional = positionValue * hedgeRatio;
  const hedgeSize = hedgeNotional / snapshot.market.markPrice;
  const estimatedTailLoss = unhedgedTailLoss * (1 - hedgeRatio);
  const estimatedLossAvoided = unhedgedTailLoss - estimatedTailLoss;
  const lossRatio = unhedgedTailLoss / positionValue;
  const riskLevel = lossRatio >= 0.08 ? "critical" : lossRatio >= 0.045 ? "high" : lossRatio >= 0.02 ? "medium" : "low";
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const commitmentPayload = { id, createdAt, ticker: snapshot.market.ticker, event, marketTimestamp: snapshot.market.timestamp, shadowLow, shadowHigh, hedgeRatio };
  return {
    id,
    createdAt,
    ticker: snapshot.market.ticker,
    event,
    aiMode: qwen ? "qwen" : "local-rules",
    dataSource: "agent-hub-only",
    agentHub: snapshot.agentHub,
    newsRisk,
    market: snapshot.market,
    positionValue,
    maxLoss,
    eventScore: eventAnalysis.eventScore,
    volatility: hourlyVol,
    shadowLow,
    shadowHigh,
    confidence: eventAnalysis.confidence,
    expectedMove,
    crossMarket: snapshot.crossMarket,
    riskLevel,
    hedgeRatio,
    hedgeNotional,
    hedgeSize,
    estimatedTailLoss,
    unhedgedTailLoss,
    estimatedLossAvoided,
    reasoning: eventAnalysis.reasoning,
    causalChain: eventAnalysis.causalChain,
    evidence: ["Bitget Agent Hub / BGC 实时行情已验证", "Bitget Agent Hub / BGC K 线已验证", ...eventAnalysis.evidence],
    commitment: createHash("sha256").update(JSON.stringify(commitmentPayload)).digest("hex")
  };
}
