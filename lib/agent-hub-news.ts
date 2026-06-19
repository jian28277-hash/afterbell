import { createHash } from "node:crypto";
import type { NewsItem } from "./live-types";
import { getSimulationScenario, saveAgentHubCall } from "./db";
import { externalFetch } from "./http";

const MCP_URL = "https://datahub.noxiaohao.com/mcp";
const FEEDS = "cnbc,techcrunch,theverge,arstechnica,bbc_world,guardian,fed";
const CACHE_MS = 10 * 60 * 1000;
type Cache = { expiresAt: number; items: NewsItem[]; callId: string; checkedAt: string };
let cache: Cache | null = null;

const aliases: Record<string, string[]> = {
  NVDA: ["nvda", "nvidia", "semiconductor", "ai chip", "chip export"],
  TSLA: ["tsla", "tesla", "elon musk", "electric vehicle"],
  AAPL: ["aapl", "apple", "iphone"],
  MSFT: ["msft", "microsoft", "azure", "openai"],
  META: ["meta", "facebook", "instagram", "whatsapp"],
  SAMSUNG: ["samsung", "semiconductor", "memory chip", "south korea"]
};
const macroTerms = ["federal reserve", "fed rate", "inflation", "producer price", "consumer price", "war", "conflict", "sanction", "tariff", "recession", "market crash"];

function parseSse(body: string) {
  const line = body.split("\n").find((item) => item.startsWith("data: "));
  if (!line) throw new Error("Agent Hub MCP returned no data event");
  return JSON.parse(line.slice(6)) as Record<string, unknown>;
}

async function postMcp(payload: Record<string, unknown>, sessionId?: string) {
  const response = await externalFetch(MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}) },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Agent Hub MCP HTTP ${response.status}`);
  return { payload: parseSse(await response.text()), sessionId: response.headers.get("mcp-session-id") || sessionId };
}

async function fetchAllNews() {
  if (cache && cache.expiresAt > Date.now()) return cache;
  const startedAt = Date.now();
  const command = `MCP news_feed latest --feeds ${FEEDS} --limit 10`;
  try {
    const init = await postMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "afterbell", version: "0.1.0" } } });
    if (!init.sessionId) throw new Error("Agent Hub MCP session was not created");
    const call = await postMcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "news_feed", arguments: { action: "latest", feeds: FEEDS, limit: 10 } } }, init.sessionId);
    const result = call.payload.result as { content?: Array<{ type: string; text?: string }>; isError?: boolean } | undefined;
    if (!result || result.isError) throw new Error("Agent Hub news_feed failed");
    const text = result.content?.find((item) => item.type === "text")?.text || "[]";
    const feeds = JSON.parse(text) as Array<{ feed: string; items?: Array<Partial<NewsItem>> }>;
    const items = feeds.flatMap((feed) => (feed.items || []).map((item) => ({ title: item.title || "Untitled", link: item.link || "", published: item.published || "", summary: item.summary || "", feed: feed.feed })));
    const raw = JSON.stringify(items);
    const record = saveAgentHubCall({ at: new Date().toISOString(), skill: "news-briefing", command, endpoint: "MCP tools/call news_feed", ticker: "MARKET", symbol: "NEWS", success: true, latencyMs: Date.now() - startedAt, responseHash: createHash("sha256").update(raw).digest("hex") });
    cache = { expiresAt: Date.now() + CACHE_MS, items, callId: record.id, checkedAt: record.at };
    return cache;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Agent Hub news call failed";
    saveAgentHubCall({ at: new Date().toISOString(), skill: "news-briefing", command, endpoint: "MCP tools/call news_feed", ticker: "MARKET", symbol: "NEWS", success: false, latencyMs: Date.now() - startedAt, error: detail });
    throw error;
  }
}

export async function getAgentHubNews(ticker: string) {
  const result = await fetchAllNews();
  const companyTerms = aliases[ticker.toUpperCase()] || [ticker.toLowerCase()];
  const filteredItems = result.items.filter((item) => {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    const title = item.title.toLowerCase();
    return companyTerms.some((term) => text.includes(term)) || macroTerms.some((term) => title.includes(term));
  }).slice(0, 12);
  const simulation = getSimulationScenario(ticker);
  const simulationItem = simulation ? [{
    title: `[模拟演练] ${simulation.headline}`,
    link: "",
    published: simulation.createdAt,
    summary: simulation.summary,
    feed: "afterbell-simulation"
  }] : [];
  const items = [...simulationItem, ...filteredItems].slice(0, 12);
  return {
    status: items.length ? "available" as const : "limited" as const,
    checkedAt: result.checkedAt, callId: result.callId, items,
    note: simulation
      ? "当前包含本地模拟演练新闻，用于验证自动对冲链路；不会发布到外部网络。"
      : items.length ? "Agent Hub 已发现公司或宏观相关新闻。新闻源可能延迟 15–60 分钟。" : "当前 Agent Hub 新闻源没有匹配标题，但这不代表市场上没有相关新闻。"
  };
}
