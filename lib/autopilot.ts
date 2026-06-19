import { createHash } from "node:crypto";
import { buildAnalysis } from "./analyze";
import { getAgentHubSnapshot } from "./market-data";
import { clearSimulationScenario, getAnalysis, getAutopilot, getAutopilots, getPaperOrder, getPaperOrderForAnalysis, getSimulationScenario, saveAnalysis, saveAutopilot, saveAutopilotEvent, savePaperOrder, saveSettlement } from "./db";
import { createHedgeOrder } from "./hedge";
import type { AutopilotPortfolio, AutopilotTick, OvernightAutopilot } from "./live-types";
import { getNextMarketOpen } from "./market-session";
import { assessNewsDecision, assessNewsReversal } from "./news-risk";
import { analyzeNewsRiskWithQwen } from "./qwen";
import { settleAnalysis } from "./settle";
import { closeSamsungDemoShortHedge, getDemoExecutionStatus } from "./uta-demo";

function addActivity(config: OvernightAutopilot, type: OvernightAutopilot["activity"][number]["type"], title: string, detail: string) {
  const event = { at: new Date().toISOString(), type, title, detail };
  saveAutopilotEvent(config.ticker, event);
  return [event, ...(config.activity || [])].slice(0, 30);
}

const getSnapshot = getAgentHubSnapshot;

function simulationDirection(headline: string) {
  const text = headline.toLowerCase();
  return /利好|澄清|否认|解除|获批|回购|上调|beat|approval|approved|denies|clears|buyback|upgrade/.test(text) ? "positive" as const : "negative" as const;
}

export function startAutopilot(input: Pick<OvernightAutopilot, "ticker" | "positionValue" | "maxLoss" | "anomalyThreshold">) {
  const config: OvernightAutopilot = {
    ...input, enabled: true, status: "monitoring", checks: 0,
    lastAction: "正在建立隔夜风险基线。", activity: []
  };
  config.activity = addActivity(config, "start", "自动驾驶已启动", `监控 ${input.ticker}，持仓 ${input.positionValue.toFixed(2)} 美元，最大亏损 ${input.maxLoss.toFixed(2)} 美元，异常阈值 ${(input.anomalyThreshold * 100).toFixed(2)}%。`);
  return saveAutopilot(config);
}

export function stopAutopilot(ticker: string) {
  const current = getAutopilot(ticker);
  return saveAutopilot({ ...current, enabled: false, status: "stopped", nextCheckAt: undefined, lastAction: "用户已停止隔夜监控。", activity: addActivity(current, "stop", "自动驾驶已停止", "系统不再进行新的行情巡检。") });
}

export async function syncSamsungDemoPosition() {
  const status = await getDemoExecutionStatus();
  const current = getAutopilot("SAMSUNG");
  if ((status.currentPositionSize || 0) > 0 || !current.activeOrderId) return { strategy: current, status };
  const order = getPaperOrder(current.activeOrderId);
  if (order?.mode === "bitget-demo" && order.symbol === "SAMSUNGUSDT" && order.status !== "closed") {
    savePaperOrder({ ...order, status: "exchange-flat", closedAt: new Date().toISOString() });
  }
  const strategy = saveAutopilot({
    ...current,
    enabled: false,
    status: "stopped",
    activeAnalysisId: undefined,
    activeOrderId: undefined,
    nextCheckAt: undefined,
    lastAction: "交易所持仓已归零，本地对冲状态已同步关闭。",
    activity: addActivity(current, "settle", "交易所持仓归零", "Bitget Demo 当前没有 SAMSUNGUSDT 持仓，本地对冲状态已同步关闭。")
  });
  return { strategy, status };
}

export async function closeActiveHedge(ticker: string) {
  const current = getAutopilot(ticker);
  if (!current.activeOrderId || !current.activeAnalysisId) throw new Error(`${ticker} 当前没有可取消的对冲`);
  const order = getPaperOrder(current.activeOrderId);
  if (!order) throw new Error("找不到当前对冲订单记录");
  let closedOrder = order;
  if (order.mode === "bitget-demo" && order.symbol === "SAMSUNGUSDT") {
    const closed = await closeSamsungDemoShortHedge(Number.MAX_SAFE_INTEGER, `afterbell-close-${order.id}`);
    closedOrder = savePaperOrder({
      ...order,
      status: "closed",
      closedAt: new Date().toISOString(),
      closeOrderId: closed.orderId,
      closePrice: closed.avgPrice,
      closeFee: closed.fee,
      leverage: order.leverage || closed.leverage
    });
  } else {
    closedOrder = savePaperOrder({ ...order, status: "paper-cancelled", closedAt: new Date().toISOString() });
  }
  const config = saveAutopilot({
    ...current,
    enabled: false,
    status: "stopped",
    activeAnalysisId: undefined,
    activeOrderId: undefined,
    nextCheckAt: undefined,
    lastAction: "用户已取消当前对冲并停止该策略。",
    activity: addActivity(current, "stop", "用户取消对冲", order.mode === "bitget-demo" ? `已向 Bitget Demo 提交平仓单 ${closedOrder.closeOrderId || "--"}。` : "纸面对冲已关闭。")
  });
  return { strategy: config, order: closedOrder, portfolio: getAutopilotPortfolio() };
}

export async function runAutopilotTick(ticker: string): Promise<AutopilotTick> {
  let config = getAutopilot(ticker);
  if (!config.enabled) return { config };
  try {
    const snapshot = await getSnapshot(config.ticker);
    const simulationScenario = getSimulationScenario(config.ticker);
    const now = new Date().toISOString();
    const nextMarketOpenAt = getNextMarketOpen(snapshot.market.timestamp);
    const newsFingerprint = snapshot.news.items.length
      ? createHash("sha256").update(JSON.stringify(snapshot.news.items.map((item) => [item.title, item.published]))).digest("hex")
      : "none";
    const hasNewHeadlines = newsFingerprint !== config.lastNewsFingerprint;
    let newsRisk = config.lastNewsRisk || { severity: "none" as const, direction: "neutral" as const, scope: "company" as const, affectedTickers: [config.ticker], confidence: 0, requiresMarketConfirmation: true, summary: "当前没有已分类的 Agent Hub 新闻风险。" };
    if (simulationScenario) {
      const direction = simulationDirection(simulationScenario.headline);
      newsRisk = {
        severity: "critical",
        direction,
        scope: "company",
        affectedTickers: [config.ticker],
        confidence: 0.98,
        requiresMarketConfirmation: false,
        headline: `[模拟演练] ${simulationScenario.headline}`,
        summary: simulationScenario.summary
      };
      config = { ...config, lastNewsFingerprint: newsFingerprint, lastNewsRisk: newsRisk };
    } else if (hasNewHeadlines) {
      try {
        newsRisk = await analyzeNewsRiskWithQwen(config.ticker, snapshot.news.items);
      } catch (error) {
        newsRisk = { severity: "none", direction: "neutral", scope: "company", affectedTickers: [config.ticker], confidence: 0, requiresMarketConfirmation: true, summary: `Qwen 新闻分类失败：${error instanceof Error ? error.message : "未知错误"}` };
      }
      config = { ...config, lastNewsFingerprint: newsFingerprint, lastNewsRisk: newsRisk };
    }

    if (config.activeAnalysisId) {
      const activeAnalysis = getAnalysis(config.activeAnalysisId);
      if (activeAnalysis && activeAnalysis.dataSource !== "bitget-only" && activeAnalysis.dataSource !== "agent-hub-only") {
        const legacyOrder = getPaperOrderForAnalysis(activeAnalysis.id);
        if (legacyOrder) savePaperOrder({ ...legacyOrder, status: "paper-closed-data-policy" });
        config = saveAutopilot({
          ...config, status: "monitoring", activeAnalysisId: undefined, activeOrderId: undefined,
          baselinePrice: undefined, lastCheckAt: undefined, nextCheckAt: new Date(Date.now() + 60_000).toISOString(),
          lastAction: "旧版混合数据策略已关闭，下次巡检将建立仅使用 Agent Hub 的新基线。",
          activity: addActivity(config, "settle", "旧数据策略已归档", "原策略包含非 Bitget 数据，纸面对冲已关闭；下一次巡检将仅使用 Bitget API 重建基线。")
        });
        return { config, market: snapshot.market };
      }
    }

    if (config.activeAnalysisId && snapshot.crossMarket.traditionalMarket === "open") {
      const analysis = getAnalysis(config.activeAnalysisId);
      if (analysis) {
        const settlement = settleAnalysis(analysis, snapshot.market.markPrice);
        saveSettlement(settlement);
        const order = getPaperOrderForAnalysis(analysis.id);
        if (order) savePaperOrder({ ...order, status: order.mode === "local-paper" ? "paper-closed" : "close-required" });
        config = saveAutopilot({
          ...config, status: "settled", activeAnalysisId: undefined, activeOrderId: undefined,
          baselinePrice: snapshot.market.markPrice, lastCheckAt: now, nextCheckAt: new Date(Date.now() + 60_000).toISOString(),
          nextMarketOpenAt, checks: config.checks + 1,
          lastAction: `U.S. cash market opened. Overnight hedge was verified and closed at ${snapshot.market.markPrice.toFixed(2)}.`,
          activity: addActivity(config, "settle", "美股开盘，自动结算", `在 ${snapshot.market.markPrice.toFixed(2)} 美元验证预测并关闭纸面对冲。`)
        });
        return { config, market: snapshot.market, analysis, order: order || undefined, settlement, trigger: "cash-market-open" };
      }
    }

    if (config.activeAnalysisId) {
      const reversal = assessNewsReversal(newsRisk, snapshot.market.change24h, config.ticker);
      if (reversal.shouldCloseHedge) {
        const closed = await closeActiveHedge(config.ticker);
        if (simulationScenario) clearSimulationScenario(config.ticker);
        const closedConfig = saveAutopilot({
          ...closed.strategy,
          lastCheckAt: now,
          nextCheckAt: undefined,
          lastNewsFingerprint: newsFingerprint,
          lastNewsRisk: newsRisk,
          lastAction: "强利好新闻反转，已取消当前对冲并停止该策略。",
          activity: addActivity(closed.strategy, "settle", "新闻反转，自动取消对冲", `${newsRisk.headline || newsRisk.summary}；Qwen 置信度 ${(newsRisk.confidence * 100).toFixed(0)}%，价格未继续走弱。`)
        });
        return { config: closedConfig, market: snapshot.market, order: closed.order, trigger: "positive-news-reversal" };
      }
      if (reversal.shouldWait) {
        if (simulationScenario) clearSimulationScenario(config.ticker);
        config = saveAutopilot({
          ...config, status: "waiting-open", lastCheckAt: now, nextCheckAt: new Date(Date.now() + 60_000).toISOString(),
          nextMarketOpenAt, checks: config.checks + 1, lastAction: "发现利好反转，但价格确认不足，当前对冲继续持有。",
          activity: addActivity(config, "news", "利好反转等待确认", `${newsRisk.headline || newsRisk.summary}；暂不平仓，等待价格不再走弱。`)
        });
        return { config, market: snapshot.market, trigger: "positive-news-awaiting-confirmation" };
      }
      config = saveAutopilot({
        ...config, status: "waiting-open", lastCheckAt: now, nextCheckAt: new Date(Date.now() + 60_000).toISOString(),
        nextMarketOpenAt, checks: config.checks + 1, lastAction: "对冲正在持有，等待下一次美股开盘后结算。",
        activity: addActivity(config, "wait", "对冲持仓巡检", `标记价格 ${snapshot.market.markPrice.toFixed(2)} 美元，对冲继续持有至下次美股开盘。`)
      });
      return { config, market: snapshot.market };
    }

    const baseline = config.baselinePrice ?? snapshot.market.markPrice;
    const overnightMove = Math.abs(snapshot.market.markPrice - baseline) / baseline;
    const firstAssessment = !config.lastCheckAt;
    const anomaly = overnightMove >= config.anomalyThreshold;
    const newsDecision = assessNewsDecision(newsRisk, snapshot.market.change24h, overnightMove, config.anomalyThreshold, config.ticker);
    const simulationTrigger = Boolean(simulationScenario);
    const positiveSimulation = simulationScenario && simulationDirection(simulationScenario.headline) === "positive";
    if (positiveSimulation) {
      clearSimulationScenario(config.ticker);
      config = saveAutopilot({
        ...config, status: "monitoring", baselinePrice: baseline, lastCheckAt: now,
        nextCheckAt: new Date(Date.now() + 60_000).toISOString(), nextMarketOpenAt, checks: config.checks + 1,
        lastAction: "收到利好反转新闻，但当前没有持有对冲，不需要开空或平仓。",
        activity: addActivity(config, "news", "利好反转，无需开空", `${newsRisk.headline || newsRisk.summary}；当前没有对冲仓位，系统不会因为利好新闻开空。`)
      });
      return { config, market: snapshot.market, trigger: "positive-news-no-hedge" };
    }
    const shouldAnalyze = simulationTrigger || (snapshot.crossMarket.traditionalMarket === "closed" && (anomaly || newsDecision.newsTrigger));

    if (firstAssessment && !simulationTrigger) {
      config = saveAutopilot({
        ...config, status: "monitoring", baselinePrice: snapshot.market.markPrice, lastCheckAt: now,
        nextCheckAt: new Date(Date.now() + 60_000).toISOString(), nextMarketOpenAt, checks: config.checks + 1,
        lastAction: "基线已建立。启动时不会直接开仓，正在等待新闻或价格信号确认。",
        activity: addActivity(config, "check", "隔夜基线已建立", `标记价格 ${snapshot.market.markPrice.toFixed(2)} 美元。启动时不追空，等待新闻或价格异常确认。`)
      });
      return { config, market: snapshot.market, trigger: "baseline-created" };
    }

    if (hasNewHeadlines && newsDecision.credibleNegative && !newsDecision.newsTrigger) {
      config = saveAutopilot({
        ...config, status: "monitoring", baselinePrice: baseline, lastCheckAt: now,
        nextCheckAt: new Date(Date.now() + 60_000).toISOString(), nextMarketOpenAt, checks: config.checks + 1,
        lastAction: "发现高风险新闻，但尚未得到价格确认，继续监控且不建立对冲。",
        activity: addActivity(config, "news", "新闻风险等待价格确认", `${newsRisk.headline || newsRisk.summary}；可信度 ${(newsRisk.confidence * 100).toFixed(0)}%，当前不执行对冲。`)
      });
      return { config, market: snapshot.market, trigger: "news-awaiting-confirmation" };
    }

    if (shouldAnalyze) {
      const trigger = simulationScenario
        ? `Simulation news drill: ${simulationScenario.headline}`
        : newsDecision.newsTrigger
        ? `Agent Hub news warning: ${newsRisk.headline || newsRisk.summary}`
        : `Overnight price moved ${(overnightMove * 100).toFixed(2)}%, above the ${(config.anomalyThreshold * 100).toFixed(2)}% trigger`;
      const analysis = await buildAnalysis(snapshot, `${trigger}. Evaluate next-open gap risk and protect the configured stock position.`, config.positionValue, config.maxLoss, newsRisk);
      saveAnalysis(analysis);
      if (analysis.hedgeSize > 0) {
        if (newsDecision.chaseBlocked && !simulationTrigger) {
          config = saveAutopilot({
            ...config, status: "monitoring", baselinePrice: snapshot.market.markPrice, lastCheckAt: now,
            nextCheckAt: new Date(Date.now() + 60_000).toISOString(), nextMarketOpenAt, checks: config.checks + 1,
            lastAction: "新闻风险确认时价格已经快速下跌，为避免追空，本轮禁止建立对冲。",
            activity: addActivity(config, "news", "禁止追空", `新闻风险成立，但价格已快速下跌：24H ${(snapshot.market.change24h * 100).toFixed(2)}%，相对基线 ${(overnightMove * 100).toFixed(2)}%。本轮只记录，不开空。`)
          });
          return { config, market: snapshot.market, analysis, trigger: "news-chase-blocked" };
        }
        const order = await createHedgeOrder(analysis);
        if (simulationScenario) clearSimulationScenario(config.ticker);
        config = saveAutopilot({
          ...config, status: "hedged", baselinePrice: baseline, activeAnalysisId: analysis.id, activeOrderId: order.id,
          lastCheckAt: now, nextCheckAt: new Date(Date.now() + 60_000).toISOString(), nextMarketOpenAt,
          checks: config.checks + 1, lastAction: `风险超过预算，已建立 ${(analysis.hedgeRatio * 100).toFixed(1)}% 的隔夜纸面对冲，持有至下一次美股开盘。`,
          activity: addActivity({ ...config, activity: addActivity(config, "analysis", "AI 风险分析已触发", `${trigger}；预计尾部亏损 ${analysis.unhedgedTailLoss.toFixed(2)} 美元。`) }, "hedge", "自动建立隔夜对冲", `卖出 ${order.size.toFixed(4)} ${order.symbol}，覆盖 ${(analysis.hedgeRatio * 100).toFixed(1)}% 风险敞口。`)
        });
        return { config, market: snapshot.market, analysis, order, trigger };
      }
      if (simulationScenario) clearSimulationScenario(config.ticker);
      config = saveAutopilot({
        ...config, status: "monitoring", baselinePrice: snapshot.market.markPrice, lastCheckAt: now,
        nextCheckAt: new Date(Date.now() + 60_000).toISOString(), nextMarketOpenAt, checks: config.checks + 1,
        lastAction: "基线评估完成，风险仍在预算范围内，继续等待异常信号。",
        activity: addActivity(config, "analysis", "AI 基线评估完成", `预计尾部亏损 ${analysis.unhedgedTailLoss.toFixed(2)} 美元，未超过 ${config.maxLoss.toFixed(2)} 美元预算，不执行对冲。`)
      });
      return { config, market: snapshot.market, analysis, trigger };
    }

    const checkDetail = snapshot.crossMarket.traditionalMarket === "open"
      ? `美股现货处于开盘状态，标记价格 ${snapshot.market.markPrice.toFixed(2)} 美元。`
      : `隔夜波动 ${(overnightMove * 100).toFixed(2)}%，低于 ${(config.anomalyThreshold * 100).toFixed(2)}% 触发阈值。`;
    config = saveAutopilot({
      ...config, status: "monitoring", baselinePrice: baseline, lastCheckAt: now,
      nextCheckAt: new Date(Date.now() + 60_000).toISOString(), nextMarketOpenAt, checks: config.checks + 1,
      lastAction: snapshot.crossMarket.traditionalMarket === "open"
        ? "美股现货正在交易，隔夜保护将在收盘后恢复。"
        : `未发现异常。隔夜波动 ${(overnightMove * 100).toFixed(2)}%，低于 ${(config.anomalyThreshold * 100).toFixed(2)}% 触发阈值。`,
      activity: addActivity(config, "check", `第 ${config.checks + 1} 次自动巡检`, checkDetail)
    });
    return { config, market: snapshot.market };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Autopilot check failed";
    config = saveAutopilot({ ...config, status: "error", lastCheckAt: new Date().toISOString(), lastAction: message, activity: addActivity(config, "error", "自动巡检失败", message) });
    return { config };
  }
}

export function getAutopilotPortfolio(): AutopilotPortfolio {
  const strategies = getAutopilots();
  return {
    strategies,
    enabledCount: strategies.filter((item) => item.enabled).length,
    hedgedCount: strategies.filter((item) => Boolean(item.activeOrderId)).length,
    totalPositionValue: strategies.filter((item) => item.enabled).reduce((sum, item) => sum + item.positionValue, 0),
    totalProtectedNotional: strategies.filter((item) => item.activeOrderId).reduce((sum, item) => sum + item.positionValue, 0)
  };
}

export async function runPortfolioTick() {
  const enabled = getAutopilots().filter((item) => item.enabled);
  const results = await Promise.all(enabled.map((item) => runAutopilotTick(item.ticker)));
  return { ...getAutopilotPortfolio(), results };
}
