import { randomUUID } from "node:crypto";
import { placeDemoHedge, supportsDemoOrder } from "./bitget";
import { savePaperOrder } from "./db";
import type { LiveAnalysis, PaperOrder } from "./live-types";
import { placeSamsungDemoShortHedge } from "./uta-demo";

export async function createHedgeOrder(analysis: LiveAnalysis) {
  if (analysis.hedgeSize <= 0) throw new Error("No hedge is required");
  const id = randomUUID();
  let externalOrderId: string | undefined;
  let mode: PaperOrder["mode"] = "local-paper";
  let executionPrice = analysis.market.bid * (1 - 0.0005);
  let size = analysis.hedgeSize;
  let estimatedFee = analysis.hedgeNotional * 0.0006;
  let leverage: number | undefined;
  if (analysis.market.symbol === "SAMSUNGUSDT") {
    const placed = await placeSamsungDemoShortHedge(analysis.hedgeSize, `afterbell-${id}`);
    externalOrderId = placed.orderId;
    executionPrice = placed.avgPrice || executionPrice;
    size = placed.quantity || size;
    estimatedFee = placed.fee || estimatedFee;
    leverage = placed.leverage;
    mode = "bitget-demo";
  } else if (supportsDemoOrder(analysis.market.symbol)) {
    const placed = await placeDemoHedge(analysis.market.symbol, analysis.hedgeSize, `afterbell-${id}`);
    externalOrderId = placed.orderId;
    mode = "bitget-demo";
  }
  const order: PaperOrder = {
    id, analysisId: analysis.id, createdAt: new Date().toISOString(), mode,
    symbol: analysis.market.symbol, side: "sell", size,
    referencePrice: analysis.market.markPrice,
    executionPrice, slippageBps: 5,
    estimatedFee, marketTimestamp: analysis.market.timestamp,
    status: mode === "bitget-demo" ? "submitted" : "paper-filled", externalOrderId, leverage
  };
  savePaperOrder(order);
  return order;
}
