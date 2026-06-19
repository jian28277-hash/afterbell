export type AgentVerdict = {
  name: string;
  role: string;
  verdict: string;
  confidence: number;
  tone: "bearish" | "neutral" | "defensive";
};

export type ReplayScenario = {
  id: string;
  ticker: string;
  company: string;
  event: string;
  eventTime: string;
  lastClose: number;
  shadowLow: number;
  shadowHigh: number;
  expectedGap: number;
  confidence: number;
  actualOpen: number;
  portfolioValue: number;
  exposedWeight: number;
  hedgeWeight: number;
  agents: AgentVerdict[];
  causalChain: string[];
};

export type ReplayResult = ReplayScenario & {
  shadowMid: number;
  actualGap: number;
  unprotectedLoss: number;
  protectedLoss: number;
  avoidedLoss: number;
  intervalHit: boolean;
  commitment: string;
};
