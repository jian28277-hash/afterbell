import type { CrossMarketSignal, LiveTicker, TraditionalMarketState } from "./live-types";

function getNewYorkParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function getTraditionalMarketState(timestamp: string): TraditionalMarketState {
  const parts = getNewYorkParts(new Date(timestamp));
  const weekday = parts.weekday;
  if (weekday === "Sat" || weekday === "Sun") return "closed";
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60 ? "open" : "closed";
}

export function getNextMarketOpen(timestamp: string) {
  const start = Math.floor(new Date(timestamp).getTime() / 60_000) * 60_000;
  for (let offset = 60_000; offset <= 8 * 24 * 60 * 60_000; offset += 60_000) {
    const candidate = new Date(start + offset);
    if (getTraditionalMarketState(candidate.toISOString()) === "open") return candidate.toISOString();
  }
  throw new Error("Unable to calculate the next U.S. cash-market open");
}

export function buildCrossMarketSignal(ticker: LiveTicker): CrossMarketSignal {
  const traditionalMarket = getTraditionalMarketState(ticker.timestamp);
  const markIndexDivergence = Math.abs(ticker.markPrice - ticker.indexPrice) / ticker.indexPrice;
  const bidAskSpread = Math.max(0, ticker.ask - ticker.bid) / ticker.markPrice;
  const spreadPenalty = Math.min(0.55, bidAskSpread / 0.0025 * 0.35);
  const divergencePenalty = Math.min(0.25, markIndexDivergence / 0.05 * 0.25);
  const liquidityBonus = Math.min(0.15, Math.log10(Math.max(10, ticker.quoteVolume)) / 40);
  const signalQuality = Math.max(0.15, Math.min(0.98, 0.86 - spreadPenalty - divergencePenalty + liquidityBonus));
  return {
    traditionalMarket,
    pricingMode: traditionalMarket === "open" ? "external-anchor" : "off-hours-internal",
    markIndexDivergence,
    bidAskSpread,
    signalQuality,
    signalLabel: signalQuality >= 0.75 ? "strong" : signalQuality >= 0.5 ? "usable" : "noisy"
  };
}
