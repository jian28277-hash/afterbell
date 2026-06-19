import type { ReplayScenario } from "./types";

export const scenarios: ReplayScenario[] = [
  {
    id: "nvda-export-shock",
    ticker: "NVDA",
    company: "NVIDIA",
    event: "New AI chip export restrictions announced after the U.S. market close",
    eventTime: "Friday 18:42 ET",
    lastClose: 140.15,
    shadowLow: 130.2,
    shadowHigh: 134.6,
    expectedGap: -5.5,
    confidence: 78,
    actualOpen: 132.1,
    portfolioValue: 100000,
    exposedWeight: 0.42,
    hedgeWeight: 0.68,
    causalChain: [
      "Export policy shock",
      "China revenue at risk",
      "Semiconductor valuation compression",
      "NVDA opening-gap risk",
      "Reduce portfolio delta"
    ],
    agents: [
      {
        name: "Fundamental Agent",
        role: "Revenue exposure",
        verdict: "Material downside risk to forward data-center revenue expectations.",
        confidence: 82,
        tone: "bearish"
      },
      {
        name: "Market Agent",
        role: "Cross-market evidence",
        verdict: "Semiconductor proxies and risk assets confirm a defensive repricing.",
        confidence: 74,
        tone: "neutral"
      },
      {
        name: "Risk Agent",
        role: "Portfolio protection",
        verdict: "Hedge 68% of NVDA delta until price discovery resumes.",
        confidence: 88,
        tone: "defensive"
      }
    ]
  }
];
