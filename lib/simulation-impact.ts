const aliases: Record<string, string[]> = {
  NVDA: ["NVDA", "NVIDIA", "英伟达"],
  TSLA: ["TSLA", "TESLA", "特斯拉"],
  AAPL: ["AAPL", "APPLE", "苹果"],
  MSFT: ["MSFT", "MICROSOFT", "微软"],
  META: ["META", "FACEBOOK"],
  SAMSUNG: ["SAMSUNG", "三星"]
};

const macroTerms = ["FED", "FOMC", "CPI", "PCE", "NASDAQ", "SP500", "S&P", "美股", "纳指", "通胀", "利率", "降息", "加息", "宏观", "市场"];

export function detectSimulationImpact(headline: string, candidates: string[]) {
  const upper = headline.toUpperCase();
  const matched = candidates.filter((ticker) => aliases[ticker]?.some((alias) => upper.includes(alias.toUpperCase())));
  if (matched.length) return { scope: "company" as const, affectedTickers: matched };
  if (macroTerms.some((term) => upper.includes(term.toUpperCase()))) return { scope: "macro" as const, affectedTickers: candidates };
  return { scope: "unknown" as const, affectedTickers: candidates.length === 1 ? candidates : [] };
}
