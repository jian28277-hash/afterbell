# AFTERBELL implementation plan

## Product contract

AFTERBELL must answer five questions when Bitget stock perpetuals continue trading outside the U.S. cash session:

1. What happened?
2. Which companies and factors are affected?
3. What fair-value range is supported by observable markets?
4. What is the smallest hedge that keeps loss inside the user's budget?
5. Did the pre-open prediction and hedge work after the market opened?

## Data pipeline

Store raw observations before producing any prediction. A snapshot contains:

```json
{
  "asOf": "ISO-8601 timestamp",
  "ticker": "NVDA",
  "referenceClose": 140.15,
  "bitgetFuturePrice": 133.02,
  "futureFundingRate": -0.0004,
  "tokenizedSpotPrice": 133.31,
  "crossAssets": { "BTC": -0.021, "QQQ_PROXY": -0.034, "DXY": 0.006 },
  "eventIds": ["evt_123"],
  "sourceHashes": ["sha256:..."]
}
```

Never ask the LLM to invent prices. Numerical features come from APIs and deterministic calculations. Qwen classifies events, builds the causal explanation and adjusts confidence inside constrained bounds.

## Shadow-price model

Start with an explainable ensemble instead of training a deep model:

```text
gap estimate =
  45% stock-futures implied gap
  20% tokenized-spot implied gap
  15% sector/cross-asset beta move
  10% event historical analogue
  10% Qwen event-severity adjustment
```

The range width grows with disagreement, stale inputs, low liquidity and high event uncertainty. Backtest and recalibrate these weights; do not hard-code a claim that they are optimal.

## Hedge optimizer

Optimize the smallest hedge ratio `h` from 0 to 1 that satisfies the loss budget across adverse scenarios:

```text
minimize: hedge_cost(h) + lambda * residual_tail_loss(h)
subject to: projected_portfolio_loss(h) <= user_loss_budget
```

For the hackathon, a grid search over 101 hedge ratios is transparent and sufficient. Include fees, spread and funding in every comparison.

## Agent contracts

Each agent returns schema-validated JSON:

```json
{
  "verdict": "bearish|neutral|bullish",
  "confidence": 0.78,
  "evidenceIds": ["quote_22", "news_91"],
  "reasoningSummary": "Short explanation grounded in evidence",
  "riskFlags": ["stale_reference_price"]
}
```

The Risk Agent may reduce or reject a hedge proposal. It cannot submit a real order during the competition demo.

## Proof of foresight

Canonicalize and hash:

```text
timestamp + feature snapshot hash + shadow range + confidence + hedge action
```

Persist the full payload locally and expose the SHA-256 digest publicly. Optional: batch daily digests into a Merkle root and anchor the root on a BSC testnet transaction. The product remains useful without the chain component, so implement anchoring only after the live pipeline works.

## Evaluation

Use walk-forward testing. For each event, only data available before the reference-market open may enter the prediction.

Report:

- Opening-gap direction accuracy
- 50% and 80% interval coverage
- Mean absolute gap error
- Maximum portfolio drawdown
- Hedge cost
- Tail loss at the 95th percentile
- Loss avoided versus unhedged and fixed 50% hedge baselines

## Delivery sequence

- Day 1: deterministic replay and polished reveal flow
- Days 2-3: Bitget market adapter and snapshot persistence
- Days 4-5: news normalization and Qwen JSON agents
- Days 6-7: shadow-price ensemble and confidence calibration
- Day 8: hedge optimizer and paper ledger
- Days 9-10: 20-event walk-forward benchmark
- Day 11: public deployment, live prediction feed and README
- Day 12: video, community post and submission audit

## Current implementation status

Implemented: strict Bitget Agent Hub `bitget` skill runtime through `bgc`, Agent-Hub-only live prices/candles with no direct REST fallback, Qwen structured analysis, shadow range, hedge optimizer, prediction hash, SQLite persistence, audited paper execution, current-mark settlement and permanent Agent Hub audit history.

Bitget Demo credentials authenticate successfully, but Bitget currently rejects stock-futures Demo orders with `40805 Unsupported operation`. AFTERBELL therefore uses a persistent local paper ledger for stock hedges, which matches the hackathon's accepted simulated-trading evidence requirement.
