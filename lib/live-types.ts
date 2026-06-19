export type LiveTicker = {
  ticker: string;
  symbol: string;
  lastPrice: number;
  markPrice: number;
  indexPrice: number;
  bid: number;
  ask: number;
  fundingRate: number;
  change24h: number;
  high24h: number;
  low24h: number;
  baseVolume: number;
  quoteVolume: number;
  openInterest: number;
  timestamp: string;
};

export type TraditionalMarketState = "open" | "closed";

export type CrossMarketSignal = {
  traditionalMarket: TraditionalMarketState;
  pricingMode: "external-anchor" | "off-hours-internal";
  markIndexDivergence: number;
  bidAskSpread: number;
  signalQuality: number;
  signalLabel: "strong" | "usable" | "noisy";
};

export type LiveSnapshot = {
  market: LiveTicker;
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  services: {
    agentHub: "active";
    bitgetMarket: "live";
    bitgetTicker: "live";
    bitgetCandles: "live";
    qwen: "configured" | "local-rules";
    bitgetDemo: "configured" | "local-paper";
  };
  agentHub: AgentHubEvidence;
  news: AgentHubNews;
  crossMarket: CrossMarketSignal;
};

export type NewsItem = { title: string; link: string; published: string; summary: string; feed: string };
export type SimulationScenario = {
  id: string;
  ticker: string;
  headline: string;
  summary: string;
  createdAt: string;
  expiresAt: string;
};
export type AgentHubNews = {
  status: "available" | "limited" | "unavailable";
  checkedAt: string;
  callId?: string;
  items: NewsItem[];
  note: string;
};
export type NewsRisk = {
  severity: "none" | "low" | "medium" | "high" | "critical";
  direction: "negative" | "neutral" | "positive";
  scope?: "company" | "sector" | "macro";
  affectedTickers?: string[];
  confidence: number;
  requiresMarketConfirmation: boolean;
  summary: string;
  headline?: string;
};

export type AgentHubEvidence = {
  runtime: "bitget-agent-hub";
  client: "bgc";
  tickerSource: "agent-hub";
  candlesSource: "agent-hub";
  tickerCallId: string;
  candlesCallId: string;
};

export type LiveAnalysis = {
  id: string;
  createdAt: string;
  ticker: string;
  event: string;
  aiMode: "qwen" | "local-rules";
  dataSource?: "bitget-only" | "agent-hub-only";
  agentHub?: AgentHubEvidence;
  newsRisk?: NewsRisk;
  market: LiveTicker;
  positionValue: number;
  maxLoss: number;
  eventScore: number;
  volatility: number;
  shadowLow: number;
  shadowHigh: number;
  confidence: number;
  expectedMove: number;
  crossMarket: CrossMarketSignal;
  riskLevel: "low" | "medium" | "high" | "critical";
  hedgeRatio: number;
  hedgeNotional: number;
  hedgeSize: number;
  estimatedTailLoss: number;
  unhedgedTailLoss: number;
  estimatedLossAvoided: number;
  reasoning: string;
  causalChain: string[];
  evidence: string[];
  commitment: string;
};

export type PaperOrder = {
  id: string;
  analysisId: string;
  createdAt: string;
  mode: "bitget-demo" | "local-paper";
  symbol: string;
  side: "sell";
  size: number;
  referencePrice: number;
  executionPrice: number;
  slippageBps: number;
  estimatedFee: number;
  marketTimestamp: string;
  status: string;
  externalOrderId?: string;
  leverage?: number;
  closedAt?: string;
  closeOrderId?: string;
  closePrice?: number;
  closeFee?: number;
};

export type DemoExecutionRun = {
  id: string;
  createdAt: string;
  completedAt: string;
  symbol: "SAMSUNGUSDT";
  category: "USDT-FUTURES";
  environment: "bitget-uta-v3-demo";
  status: "completed" | "open-failed" | "close-failed";
  holdMode: string;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  balanceChange: number;
  openOrderId?: string;
  openPrice?: number;
  openFee?: number;
  closeOrderId?: string;
  closePrice?: number;
  closeFee?: number;
  realizedPnl?: number;
  finalPositionSize?: number;
  error?: string;
};

export type DemoExecutionStatus = {
  configured: boolean;
  api: "Bitget UTA V3 Demo";
  symbol: "SAMSUNGUSDT";
  instrumentOnline: boolean;
  symbolType?: string;
  isRwa?: string;
  markPrice?: number;
  minOrderQty?: number;
  minOrderAmount?: number;
  accountEquity?: number;
  availableBalance?: number;
  holdMode?: string;
  currentPositionSize?: number;
  checkedAt: string;
};

export type Settlement = {
  id: string;
  analysisId: string;
  createdAt: string;
  ticker: string;
  observedPrice: number;
  intervalHit: boolean;
  rawReturn: number;
  unhedgedPnl: number;
  hedgedPnl: number;
  lossAvoided: number;
};

export type OvernightAutopilot = {
  enabled: boolean;
  ticker: string;
  positionValue: number;
  maxLoss: number;
  anomalyThreshold: number;
  status: "stopped" | "monitoring" | "hedged" | "waiting-open" | "settled" | "error";
  lastCheckAt?: string;
  nextCheckAt?: string;
  nextMarketOpenAt?: string;
  baselinePrice?: number;
  activeAnalysisId?: string;
  activeOrderId?: string;
  lastAction: string;
  checks: number;
  lastNewsFingerprint?: string;
  lastNewsRisk?: NewsRisk;
  activity: Array<{
    at: string;
    type: "start" | "check" | "news" | "analysis" | "hedge" | "wait" | "settle" | "stop" | "error";
    title: string;
    detail: string;
  }>;
};

export type AutopilotEvent = OvernightAutopilot["activity"][number] & {
  id: string;
  ticker: string;
};

export type BitgetApiCall = {
  id: string;
  at: string;
  endpoint: string;
  ticker: string;
  symbol: string;
  status: number;
  success: boolean;
  latencyMs: number;
  error?: string;
};

export type AgentHubCall = {
  id: string;
  at: string;
  skill: "bitget" | "news-briefing";
  command: string;
  endpoint: string;
  ticker: string;
  symbol: string;
  success: boolean;
  latencyMs: number;
  responseHash?: string;
  error?: string;
};

export type AutopilotTick = {
  config: OvernightAutopilot;
  market?: LiveTicker;
  analysis?: LiveAnalysis;
  order?: PaperOrder;
  settlement?: Settlement;
  trigger?: string;
};

export type AutopilotPortfolio = {
  strategies: OvernightAutopilot[];
  enabledCount: number;
  hedgedCount: number;
  totalPositionValue: number;
  totalProtectedNotional: number;
};
