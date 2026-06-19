import { getAgentHubCandles, getAgentHubTicker } from "./agent-hub";
import { getAgentHubNews } from "./agent-hub-news";
import { getCrossMarketSignal, supportsDemoOrder } from "./bitget";
import type { LiveSnapshot } from "./live-types";
import { hasQwen } from "./qwen";

export async function getAgentHubSnapshot(ticker: string): Promise<LiveSnapshot> {
  const [hubTicker, hubCandles, news] = await Promise.all([
    getAgentHubTicker(ticker),
    getAgentHubCandles(ticker),
    getAgentHubNews(ticker).catch((error) => ({
      status: "unavailable" as const,
      checkedAt: new Date().toISOString(),
      items: [],
      note: `Agent Hub 新闻工具暂时不可用：${error instanceof Error ? error.message : "未知错误"}`
    }))
  ]);
  const market = hubTicker.market;
  const candles = hubCandles.candles;
  return {
    market,
    candles,
    crossMarket: getCrossMarketSignal(market),
    agentHub: {
      runtime: "bitget-agent-hub", client: "bgc",
      tickerSource: "agent-hub", candlesSource: "agent-hub",
      tickerCallId: hubTicker.callId, candlesCallId: hubCandles.callId
    },
    news,
    services: {
      agentHub: "active",
      bitgetMarket: "live", bitgetTicker: "live", bitgetCandles: "live",
      qwen: hasQwen() ? "configured" : "local-rules",
      bitgetDemo: supportsDemoOrder(market.symbol) ? "configured" : "local-paper"
    }
  };
}
