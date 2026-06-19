import type { NewsRisk } from "./live-types";

export function isTickerAffected(newsRisk: NewsRisk, ticker: string) {
  const affected = newsRisk.affectedTickers || [];
  if (newsRisk.scope === "macro") return true;
  if (!affected.length) return true;
  return affected.map((item) => item.toUpperCase()).includes(ticker.toUpperCase());
}

export function assessNewsDecision(newsRisk: NewsRisk, marketChange: number, overnightMove: number, anomalyThreshold: number, ticker: string) {
  const affected = isTickerAffected(newsRisk, ticker);
  const marketConfirmed = marketChange <= -0.003 || overnightMove >= anomalyThreshold * 0.5;
  const credibleNegative = affected
    && newsRisk.direction === "negative"
    && (newsRisk.severity === "high" || newsRisk.severity === "critical")
    && newsRisk.confidence >= 0.75;
  const newsTrigger = credibleNegative && (!newsRisk.requiresMarketConfirmation || marketConfirmed);
  const chaseBlocked = newsTrigger && (marketChange <= -0.02 || overnightMove >= 0.02);
  return { affected, marketConfirmed, credibleNegative, newsTrigger, chaseBlocked };
}

export function assessNewsReversal(newsRisk: NewsRisk, marketChange: number, ticker: string) {
  const affected = isTickerAffected(newsRisk, ticker);
  const crediblePositive = affected
    && newsRisk.direction === "positive"
    && (newsRisk.severity === "high" || newsRisk.severity === "critical")
    && newsRisk.confidence >= 0.78;
  const priceNoLongerWeak = marketChange >= -0.002;
  const shouldCloseHedge = crediblePositive && (!newsRisk.requiresMarketConfirmation || priceNoLongerWeak);
  const shouldWait = crediblePositive && !shouldCloseHedge;
  return { affected, crediblePositive, priceNoLongerWeak, shouldCloseHedge, shouldWait };
}
