# AFTERBELL Submission Package

## Track

Stock AI Trading

## Short Description

AFTERBELL is an overnight risk autopilot for tokenized stock futures. It monitors Bitget Agent Hub market data and news, uses Qwen to classify company-level, sector-level, and macro risk, and automatically opens or closes a protective hedge in Bitget Demo when the user has enabled autopilot and risk conditions are met.

## Problem

U.S. stocks stop trading overnight, but news and tokenized futures continue moving. Retail users cannot monitor risk 24/7 and may face next-open gap risk.

## Solution

Users select a stock and enable autopilot. AFTERBELL reads Bitget market data and news, identifies whether a negative or positive event affects the selected stock, opens a hedge only when protection is enabled, and closes the hedge when positive reversal news appears.

## Bitget Usage

- Bitget Agent Hub / `bgc` client.
- `futures_get_ticker` for live stock-futures market data.
- `futures_get_candles` for hourly candles.
- Agent Hub `news_feed` for company and macro news.
- Bitget UTA V3 Demo order execution for `SAMSUNGUSDT`.

## AI Usage

- Qwen risk classification.
- News direction: negative / neutral / positive.
- Impact scope: company / sector / macro.
- Affected-ticker extraction.
- Hedge reason generation.

## Verification

The demo video shows:

1. SAMSUNG autopilot is enabled by the user.
2. A simulated negative SAMSUNG headline triggers risk analysis.
3. AFTERBELL opens a protective SAMSUNGUSDT hedge.
4. The Bitget Demo exchange page shows the matching order or position.
5. A simulated positive reversal headline cancels the hedge.
6. The Bitget Demo exchange page shows the position is closed.
7. The records center stores Agent Hub calls, Qwen analysis, orders, and evidence.

## Evidence

Machine-verifiable evidence can be exported from:

```text
GET /api/evidence
```

The evidence includes:

- Agent Hub command records;
- ticker and candle calls;
- news calls;
- analysis records;
- hedge order records;
- execution mode;
- response hashes and timestamps.

## Final Checklist

- [x] Runnable local demo.
- [x] Bitget Agent Hub integration.
- [x] Bitget stock-related data/tools used.
- [x] Qwen risk classification.
- [x] Demo video showing open and close verification.
- [x] Verifiable audit records.
- [ ] Public GitHub repository URL.
- [ ] Public demo video URL.
