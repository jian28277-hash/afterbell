# AFTERBELL

AFTERBELL is an overnight risk autopilot for tokenized stock futures. It helps users protect positions while the U.S. cash market is closed by reading Bitget Agent Hub market data and news, classifying risk with Qwen, and opening or closing a protective hedge when the user has explicitly enabled autopilot.

## What It Solves

U.S. stocks stop trading overnight, but tokenized stock futures and market news can keep moving. A user may go to sleep with a position and wake up to a large next-open gap. AFTERBELL focuses on that specific risk window:

- detect off-hours price and liquidity changes;
- classify company, sector, and macro news impact;
- avoid opening protection unless the user has enabled autopilot;
- open a hedge only when risk conditions are met;
- close the hedge when positive reversal news removes the risk;
- keep a verifiable audit trail of data calls, AI judgments, and orders.

## Core Demo Flow

1. Select `SAMSUNG` and start portfolio autopilot.
2. Inject a simulated negative SAMSUNG headline.
3. AFTERBELL identifies company-level risk and only affects SAMSUNG.
4. The system opens a protective `SAMSUNGUSDT` hedge through Bitget UTA V3 Demo.
5. The Bitget Demo web page shows the matching order or position.
6. Inject a simulated positive reversal headline.
7. AFTERBELL closes the protection.
8. The Bitget Demo web page shows the position is closed.

Other supported stock tickers are used for Agent Hub market data, news analysis, Qwen classification, portfolio logic, and audited paper hedging. `SAMSUNGUSDT` is included because Bitget Demo currently exposes it as a stock-type contract that can be used for verifiable simulated execution.

## Bitget And AI Usage

- Bitget Agent Hub / `bgc` client for market data.
- `futures_get_ticker` for live stock-futures ticker data.
- `futures_get_candles` for hourly candles.
- Agent Hub `news_feed` for market and company news.
- Bitget UTA V3 Demo API for `SAMSUNGUSDT` hedge open and close verification.
- Qwen for structured news-risk judgment:
  - direction: negative / neutral / positive;
  - scope: company / sector / macro;
  - affected tickers;
  - confidence;
  - summary and hedge reason.

## Product Features

- Portfolio autopilot with explicit user opt-in.
- Startup baseline mode: enabling autopilot does not immediately open a hedge.
- Company-level news isolation: SAMSUNG news does not trigger unrelated tickers.
- Macro-news handling for portfolio-wide risk.
- Negative-news protection and positive-news reversal close.
- Anti-chasing rules after a sharp fall.
- Bitget Demo execution status for `SAMSUNGUSDT`.
- Persistent SQLite records for:
  - Agent Hub calls;
  - Qwen analyses;
  - hedge orders;
  - open and close reasons;
  - settlement and audit evidence.
- Exportable evidence endpoint at `/api/evidence`.

## Run Locally

```bash
npm install
cp .env.example .env.local
npm run build
npm start -- -p 3001
```

Open:

```text
http://127.0.0.1:3001
```

For development:

```bash
npm run dev
```

## Environment Variables

Create `.env.local` from `.env.example`.

```bash
BITGET_API_KEY=
BITGET_SECRET_KEY=
BITGET_PASSPHRASE=
BITGET_DEMO_CONFIRMED=false

BITGET_QWEN_API_KEY=
QWEN_BASE_URL=https://hackathon.bitgetops.com/v1
QWEN_MODEL=qwen3.6-plus
```

Use a Bitget Demo API key only. Do not use a live-trading API key.

## Verification

```bash
npm test
npm run build
```

The current test suite covers:

- U.S. cash-market session detection;
- off-hours signal quality;
- next market open calculation;
- news-trigger confirmation logic;
- anti-chasing logic;
- company-specific news isolation;
- macro-news portfolio impact;
- hedge settlement math;
- simulation impact filtering.

## Submission Notes

Recommended submission materials:

- GitHub repository link;
- demo video link;
- local run instructions;
- screenshots or exported evidence from `/api/evidence`;
- Bitget Demo order verification for the SAMSUNGUSDT open and close flow.

Do not commit `.env.local`, private API keys, local SQLite data, `.next`, or `node_modules`.
