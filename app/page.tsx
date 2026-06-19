"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { AgentHubCall, AutopilotEvent, AutopilotPortfolio, AutopilotTick, BitgetApiCall, DemoExecutionStatus, LiveAnalysis, LiveSnapshot, OvernightAutopilot, PaperOrder, Settlement } from "@/lib/live-types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const tickers = ["NVDA", "TSLA", "AAPL", "MSFT", "META", "SAMSUNG"];
type Policy = { positionValue: number; maxLoss: number; anomalyThreshold: number };
const defaultPolicies = Object.fromEntries(tickers.map((item) => [item, { positionValue: 100000, maxLoss: 1500, anomalyThreshold: 0.5 }])) as Record<string, Policy>;

export default function Home() {
  const [ticker, setTicker] = useState("NVDA");
  const [selectedTickers, setSelectedTickers] = useState<string[]>(["NVDA"]);
  const [policies, setPolicies] = useState<Record<string, Policy>>(defaultPolicies);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [order, setOrder] = useState<PaperOrder | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [history, setHistory] = useState<{ analyses: LiveAnalysis[]; orders: PaperOrder[]; settlements: Settlement[]; events: AutopilotEvent[]; apiCalls: BitgetApiCall[]; agentHubCalls: AgentHubCall[] }>({ analyses: [], orders: [], settlements: [], events: [], apiCalls: [], agentHubCalls: [] });
  const [demoStatus, setDemoStatus] = useState<DemoExecutionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [bearishHeadline, setBearishHeadline] = useState("突发利空：监管机构扩大调查，盘后交易员快速下调风险敞口");
  const [bullishHeadline, setBullishHeadline] = useState("突发利好反转：公司发布澄清公告，监管风险解除，盘后买盘快速恢复");
  const [simulationTickers, setSimulationTickers] = useState<string[]>(["SAMSUNG"]);
  const [simulationNotice, setSimulationNotice] = useState("演练默认跟随当前正在守护的股票。公司级新闻只影响对应公司，不会扩散到其它股票。");
  const [error, setError] = useState("");
  const [portfolio, setPortfolio] = useState<AutopilotPortfolio>({ strategies: [], enabledCount: 0, hedgedCount: 0, totalPositionValue: 0, totalProtectedNotional: 0 });
  const [runMode, setRunMode] = useState<"manual" | "auto">("manual");
  const [clock, setClock] = useState(Date.now());
  const [recordTicker, setRecordTicker] = useState("ALL");
  const [recordType, setRecordType] = useState("ALL");
  const runningStrategies = portfolio.strategies.filter((strategy) => strategy.enabled);
  const guardedTickers = runningStrategies.map((strategy) => strategy.ticker);
  const effectiveSimulationTickers = simulationTickers.filter((item) => guardedTickers.includes(item));
  const activeHedgeStrategies = portfolio.strategies.filter((strategy) => strategy.activeOrderId);
  const hasSamsungLocalHedge = activeHedgeStrategies.some((strategy) => strategy.ticker === "SAMSUNG");
  const hasSamsungExchangePosition = Boolean((demoStatus?.currentPositionSize || 0) > 0);
  const latestEvent = history.events[0];
  const latestOrder = history.orders[0];
  const nextAction = portfolio.hedgedCount
    ? "当前已有对冲，继续盯新闻；若出现高可信利好反转，会自动平仓。"
    : portfolio.enabledCount
    ? "自动驾驶正在等待公司级 / 行业级 / 宏观级利空，命中范围后才会开保护。"
    : "选择股票并启动组合自动驾驶，系统会先建立基线，不会一启动就追空。";
  const healthItems = [
    { name: "Agent Hub 行情", value: snapshot?.services.agentHub === "active" ? "已接入" : "待同步", live: snapshot?.services.agentHub === "active" },
    { name: "Agent Hub 新闻", value: snapshot?.news.status === "unavailable" ? "待同步" : "已接入", live: snapshot?.news.status !== "unavailable" && Boolean(snapshot) },
    { name: "Qwen 风险分析", value: snapshot?.services.qwen === "configured" ? "已接入" : "本地兜底", live: snapshot?.services.qwen === "configured" },
    { name: "影响范围判断", value: "公司/行业/宏观", live: true },
    { name: "利空开保护", value: "已接入", live: true },
    { name: "利好撤保护", value: "已接入", live: true },
    { name: "Bitget Demo 执行", value: demoStatus?.configured ? "SAMSUNG 可用" : "待配置", live: Boolean(demoStatus?.configured) },
    { name: "证据中心", value: `${history.events.length} 条记录`, live: history.events.length > 0 }
  ];

  const loadLive = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/live?ticker=${ticker}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Live data failed");
      setSnapshot(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Live data failed");
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/history", { cache: "no-store" });
    if (response.ok) setHistory(await response.json());
  }, []);

  const applyAutopilotPayload = useCallback((payload: AutopilotPortfolio & { results?: AutopilotTick[] }) => {
    setPortfolio({ strategies: payload.strategies, enabledCount: payload.enabledCount, hedgedCount: payload.hedgedCount, totalPositionValue: payload.totalPositionValue, totalProtectedNotional: payload.totalProtectedNotional });
    const latest = payload.results?.findLast((item) => item.analysis || item.order || item.settlement);
    if (latest?.analysis) setAnalysis(latest.analysis);
    if (latest?.order) setOrder(latest.order);
    if (latest?.settlement) setSettlement(latest.settlement);
  }, []);

  const loadAutopilot = useCallback(async () => {
    const response = await fetch("/api/autopilot", { cache: "no-store" });
    if (response.ok) applyAutopilotPayload(await response.json());
  }, [applyAutopilotPayload]);

  const loadDemoStatus = useCallback(async () => {
    const response = await fetch("/api/demo-execution", { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      setDemoStatus(payload.status);
    }
  }, []);

  useEffect(() => { loadLive(); loadHistory(); loadAutopilot(); loadDemoStatus(); }, [loadLive, loadHistory, loadAutopilot, loadDemoStatus]);
  useEffect(() => { if (snapshot) loadHistory(); }, [snapshot, loadHistory]);
  useEffect(() => {
    const timer = window.setInterval(loadLive, 15_000);
    return () => window.clearInterval(timer);
  }, [loadLive]);

  useEffect(() => {
    if (!portfolio.enabledCount) return;
    const timer = window.setInterval(async () => {
      await loadAutopilot();
      await loadHistory();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [portfolio.enabledCount, loadAutopilot, loadHistory]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (portfolio.enabledCount) setRunMode("auto");
  }, [portfolio.enabledCount]);

  useEffect(() => {
    if (!guardedTickers.length) return;
    setSimulationTickers(guardedTickers);
    setSimulationNotice(`已跟随当前守护：${guardedTickers.join("、")}。利空/利好演练只会作用于这些正在运行的策略。`);
  }, [guardedTickers.join("、")]);

  async function startOvernightAutopilot(eventObject: FormEvent) {
    eventObject.preventDefault();
    setRunning(true);
    setError("");
    setAnalysis(null);
    setOrder(null);
    setSettlement(null);
    try {
      const response = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start_many",
          strategies: selectedTickers.map((item) => ({ ticker: item, ...policies[item], anomalyThreshold: policies[item].anomalyThreshold / 100 }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to start overnight protection");
      applyAutopilotPayload(payload);
      await loadHistory();
      await loadLive();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start overnight protection");
    } finally {
      setRunning(false);
    }
  }

  async function stopOvernightAutopilot(targetTicker: string) {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", ticker: targetTicker }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to stop overnight protection");
      applyAutopilotPayload(payload.portfolio);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to stop overnight protection");
    } finally {
      setRunning(false);
    }
  }

  async function closeHedge(targetTicker: string) {
    const strategy = portfolio.strategies.find((item) => item.ticker === targetTicker);
    const activeOrder = history.orders.find((item) => item.id === strategy?.activeOrderId);
    const message = activeOrder?.mode === "bitget-demo"
      ? `确认要平掉 ${targetTicker} 的 Bitget Demo 对冲空单吗？这会提交真实模拟盘平仓单。`
      : `确认要取消 ${targetTicker} 的纸面对冲记录吗？`;
    if (!window.confirm(message)) return;
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/hedge-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: targetTicker, confirmClose: true })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to close hedge");
      applyAutopilotPayload(payload.portfolio);
      await loadHistory();
      await loadAutopilot();
      await loadLive();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to close hedge");
    } finally {
      setRunning(false);
    }
  }

  async function closeSamsungExchangePosition() {
    if (!window.confirm("确认要平掉 Bitget Demo 账户里的 SAMSUNGUSDT 空单吗？这会提交真实模拟盘平仓单。")) return;
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/demo-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close_short", symbol: "SAMSUNGUSDT", confirmDemo: true })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to close Samsung Demo position");
      setDemoStatus(payload.status);
      await fetch("/api/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", ticker: "SAMSUNG" }) }).catch(() => undefined);
      await loadAutopilot();
      await loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to close Samsung Demo position");
    } finally {
      setRunning(false);
    }
  }

  async function runHealthCheck() {
    setHealthChecking(true);
    setError("");
    try {
      await Promise.all([loadLive(), loadAutopilot(), loadHistory(), loadDemoStatus()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "健康检查失败");
    } finally {
      setHealthChecking(false);
    }
  }

  async function runSimulationDrill(kind: "bearish" | "bullish") {
    const targetTickers = effectiveSimulationTickers;
    if (simulationRunning) return;
    if (!portfolio.enabledCount || !targetTickers.length) {
      setSimulationNotice("请先在下方开启自动驾驶守护，再进行利空 / 利好演练。演练不会自动创建守护策略。");
      return;
    }
    const headline = kind === "bullish" ? bullishHeadline : bearishHeadline;
    setSimulationRunning(true);
    setError("");
    setSimulationNotice(`正在为 ${targetTickers.join("、")} 注入模拟${kind === "bullish" ? "利好反转" : "利空"}新闻，并启动自动分析链路...`);
    try {
      const response = await fetch("/api/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline,
          kind,
          strategies: targetTickers.map((item) => ({
            ticker: item,
            positionValue: policies[item].positionValue,
            maxLoss: Math.min(policies[item].maxLoss, 100),
            anomalyThreshold: Math.max(0.001, policies[item].anomalyThreshold / 100)
          }))
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Simulation failed");
      const resultSummary = payload.results?.map((item: { ticker: string; ok: boolean; error?: string; result?: AutopilotTick }) => {
        if (!item.ok) return `${item.ticker} 失败`;
        if (item.result?.trigger === "positive-news-reversal") return `${item.ticker} 已取消对冲`;
        if (item.result?.trigger === "positive-news-awaiting-confirmation") return `${item.ticker} 等待确认`;
        if (item.result?.trigger === "positive-news-no-hedge") return `${item.ticker} 无对冲，不开空`;
        if (item.result?.trigger === "simulation-requires-autopilot") return `${item.ticker} 未开启自动驾驶，已跳过`;
        if (item.result?.trigger === "simulation-unaffected") return `${item.ticker} 不受该新闻影响`;
        if (item.result?.order) return `${item.ticker} 已开对冲`;
        if (item.result?.analysis) return `${item.ticker} 已分析`;
        return `${item.ticker} 已巡检`;
      }).join(" · ");
      const latest = payload.results?.findLast((item: { result?: AutopilotTick }) => item.result?.analysis || item.result?.order || item.result?.settlement)?.result;
      if (latest?.analysis) setAnalysis(latest.analysis);
      if (latest?.order) setOrder(latest.order);
      if (latest?.settlement) setSettlement(latest.settlement);
      if (payload.results?.some((item: { ok: boolean }) => !item.ok)) {
        const failed = payload.results.filter((item: { ok: boolean }) => !item.ok).map((item: { ticker: string; error: string }) => `${item.ticker}: ${item.error}`).join("；");
        setError(`部分标的演练失败：${failed}`);
      }
      setSimulationNotice(resultSummary ? `演练完成：${resultSummary}` : "演练完成，已刷新自动驾驶和证据记录。");
      await loadAutopilot();
      await loadHistory();
      await loadLive();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Simulation failed");
    } finally {
      setSimulationRunning(false);
    }
  }

  function toggleTicker(item: string) {
    setTicker(item);
    setSelectedTickers((current) => current.includes(item) ? current.filter((candidate) => candidate !== item) : [...current, item]);
  }

  function toggleSimulationTicker(item: string) {
    setSimulationTickers((current) => {
      const next = current.includes(item) ? current.filter((candidate) => candidate !== item) : [...current, item];
      setSimulationNotice(next.length ? `已选择 ${next.join("、")}。下一步点击右侧绿色按钮，系统才会发布模拟新闻并自动执行。` : "当前没有选择任何股票，请至少选择 1 只。");
      return next;
    });
  }

  function updatePolicy(field: keyof Policy, value: number) {
    if (!policies[ticker]) return;
    setPolicies((current) => ({ ...current, [ticker]: { ...current[ticker], [field]: value } }));
  }

  return (
    <main>
      <nav>
        <div className="brand"><span /> AFTERBELL</div>
        <div className="nav-actions">
          <a href="#autopilot-console">自动驾驶</a>
          <a href="#hedge-orders">当前对冲</a>
          <a href="#records-center">证据中心</a>
          <div className="live"><i /> 实时市场模式</div>
        </div>
      </nav>

      <section className="hero live-hero">
        <div>
          <p className="eyebrow">美股隔夜风险自动驾驶</p>
          <h1>休市安心睡。<br />开盘有保护。</h1>
          <p className="subtitle">你只负责设置亏损预算。系统负责盯盘、读新闻、判断风险、自动建立对冲，并把订单号、开单原因和后续结果全部保存。</p>
          <div className="hero-proof">
            <span>全自动巡检</span>
            <span>新闻 + 价格双触发</span>
            <span>开单原因可解释</span>
            <span>订单记录可追踪</span>
          </div>
        </div>
        <div className="service-stack">
          <Status name="Bitget Agent Hub" value={snapshot?.services.agentHub === "active" ? "运行正常" : "连接中"} live={snapshot?.services.agentHub === "active"} />
          <Status name="实时行情工具" value={snapshot ? "已验证" : "连接中"} live={Boolean(snapshot)} />
          <Status name="K 线工具" value={snapshot ? "已验证" : "连接中"} live={Boolean(snapshot)} />
          <Status name="新闻工具" value={newsStatusLabel(snapshot?.news.status)} live={snapshot?.news.status !== "unavailable" && Boolean(snapshot)} />
          <Status name="数据策略" value="仅使用 Agent Hub" live />
          <Status name="AI 分析" value={snapshot?.services.qwen === "configured" ? "Qwen 已接入" : "本地规则"} live={snapshot?.services.qwen === "configured"} />
          <Status name="执行方式" value={snapshot?.services.bitgetDemo === "configured" ? "Bitget 模拟盘" : "审计纸面交易"} live />
          <Status name="美股现货市场" value={snapshot ? marketStateLabel(snapshot.crossMarket.traditionalMarket) : "检查中"} live={snapshot?.crossMarket.traditionalMarket === "open"} />
        </div>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <section className="autopilot-command" id="autopilot-console">
        <div className="command-hero">
          <div>
            <label>自动驾驶风控台</label>
            <h2>{portfolio.enabledCount ? "隔夜风险监控正在运行" : "启动后自动监控隔夜风险"}</h2>
            <p>系统整合行情、新闻、Qwen 结构化判断、影响范围识别、对冲执行、反转平仓、订单追踪和审计记录。</p>
          </div>
          <button type="button" className="health-button" onClick={runHealthCheck} disabled={healthChecking || loading}>{healthChecking ? "检查中..." : "系统健康检查"}<b>→</b></button>
        </div>
        <div className="command-grid">
          <div className="command-card next-step">
            <label>下一步会做什么</label>
            <strong>{nextAction}</strong>
            <small>{latestEvent ? `最近记录：${latestEvent.ticker} · ${latestEvent.title}` : "暂无运行记录，启动后会自动保存每一步。"}</small>
          </div>
          <div className="command-card">
            <label>真实 Demo 状态</label>
            <strong>{demoStatus?.configured ? `SAMSUNGUSDT 持仓 ${demoStatus.currentPositionSize || 0}` : "Demo Key 待确认"}</strong>
            <small>{latestOrder?.externalOrderId ? `最近订单号：${latestOrder.externalOrderId}` : "SAMSUNG 可用于真实模拟盘下单验证。"}</small>
          </div>
          <div className="command-card">
            <label>风控规则</label>
            <strong>利空才开保护，利好只撤保护</strong>
            <small>公司级新闻不扩散；行业级影响同行；宏观级才影响全组合。</small>
          </div>
        </div>
        <div className="health-grid">
          {healthItems.map((item) => <div className={item.live ? "health-item ok" : "health-item"} key={item.name}><i /><span>{item.name}</span><b>{item.value}</b></div>)}
        </div>
      </section>

      <section className="simulation-panel">
        <div className="analysis-head">
          <div><label>模拟新闻演练</label><h2>利空开保护，利好撤保护</h2><p className="storage-note">利空输入框用于触发开对冲；利好输入框只用于反转处理，有对冲才取消，没有对冲绝不会开空。</p></div>
          <div className="mode-chip">演练模式</div>
        </div>
        <div className="simulation-body">
          <div>
            <label>当前演练组合</label>
            <strong>{effectiveSimulationTickers.length} 只股票</strong>
            <span>{portfolio.enabledCount ? "演练只能作用于当前正在守护的股票。公司级新闻只影响对应公司，不会把 SAMSUNG 利空扩散到其它股票。" : "当前没有运行中的守护策略。请先在下方选择股票并启动组合自动驾驶，然后再做新闻演练。"}</span>
            <div className="simulation-actions">
              <button type="button" onClick={() => {
                const next = guardedTickers;
                setSimulationTickers(next);
                setSimulationNotice(next.length ? `已选择当前守护：${next.join("、")}。` : "当前没有运行中的守护策略，请先启动自动驾驶。");
              }} disabled={simulationRunning || !guardedTickers.length}>选择运行中</button>
              <button type="button" onClick={() => { setSimulationTickers([]); setSimulationNotice("已清空演练组合，请至少选择 1 只股票。"); }} disabled={simulationRunning}>清空</button>
            </div>
            <div className="simulation-tickers">{tickers.map((item) => <button type="button" className={simulationTickers.includes(item) ? "selected" : ""} onClick={() => toggleSimulationTicker(item)} disabled={simulationRunning || !guardedTickers.includes(item)} key={item}>{simulationTickers.includes(item) ? "✓ " : ""}{item}</button>)}</div>
            <p className="simulation-selected">已选：{simulationTickers.length ? simulationTickers.join("、") : "暂无"} · 本次实际触发：{effectiveSimulationTickers.length ? effectiveSimulationTickers.join("、") : "暂无"}</p>
          </div>
          <div className="simulation-scenarios">
            <div className="simulation-scenario bearish">
              <label>利空测试输入框</label>
              <textarea value={bearishHeadline} onChange={(event) => setBearishHeadline(event.target.value)} rows={3} />
              <button className="simulation-run-button" type="button" onClick={() => runSimulationDrill("bearish")} disabled={simulationRunning || loading || bearishHeadline.trim().length < 8 || effectiveSimulationTickers.length === 0}><span>{simulationRunning ? `正在触发 ${effectiveSimulationTickers.length} 只股票...` : effectiveSimulationTickers.length ? `利空测试：触发 ${effectiveSimulationTickers.length} 只股票` : "请先启动自动驾驶"}</span><small>{effectiveSimulationTickers.includes("SAMSUNG") ? "包含 SAMSUNG：会尝试 Bitget Demo 真实下单" : effectiveSimulationTickers.length ? "其它股票会生成纸面对冲记录" : "演练只允许作用于运行中的守护策略"}</small><b>→</b></button>
            </div>
            <div className="simulation-scenario bullish">
              <label>利好反转输入框</label>
              <textarea value={bullishHeadline} onChange={(event) => setBullishHeadline(event.target.value)} rows={3} />
              <button className="simulation-reversal-button" type="button" onClick={() => runSimulationDrill("bullish")} disabled={simulationRunning || loading || bullishHeadline.trim().length < 8 || effectiveSimulationTickers.length === 0}>利好测试：只取消对冲，不开空</button>
            </div>
          </div>
        </div>
        <div className={`simulation-feedback ${simulationRunning ? "running" : ""}`}>{simulationNotice}</div>
      </section>

      {runningStrategies.length > 0 && <section className="runtime-detail portfolio-console" id="strategy-console">
        <div className="runtime-head">
          <div><label>组合自动驾驶</label><h2>{portfolio.enabledCount ? `${portfolio.enabledCount} 只股票正在自动运行` : "当前没有运行中的策略"}</h2></div>
          {portfolio.enabledCount > 0 && <div className="pulse-chip"><i /> 每 60 秒并行巡检</div>}
        </div>
        <div className="portfolio-summary">
          <RuntimeMetric label="运行中策略" value={String(portfolio.enabledCount)} accent />
          <RuntimeMetric label="已建立对冲" value={String(portfolio.hedgedCount)} accent={portfolio.hedgedCount > 0} />
          <RuntimeMetric label="总监控持仓" value={money.format(portfolio.totalPositionValue)} />
          <RuntimeMetric label="已保护持仓" value={money.format(portfolio.totalProtectedNotional)} />
        </div>
        <div className="strategy-grid">
          {runningStrategies.map((strategy) => <StrategyCard key={strategy.ticker} strategy={strategy} clock={clock} activeOrder={history.orders.find((item) => item.id === strategy.activeOrderId)} activeAnalysis={history.analyses.find((item) => item.id === strategy.activeAnalysisId)} onView={() => setTicker(strategy.ticker)} onStop={() => stopOvernightAutopilot(strategy.ticker)} running={running} />)}
        </div>
      </section>}

      <section className="hedge-orders" id="hedge-orders">
        <div className="analysis-head">
          <div><label>当前对冲订单</label><h2>{portfolio.hedgedCount ? `${portfolio.hedgedCount} 个对冲正在持有` : "暂未触发对冲"}</h2><p className="storage-note">只有系统判断风险超过预算时才会自动出现订单；没有风险时保持空白等待。</p></div>
          <div className={portfolio.hedgedCount ? "mode-chip" : "mode-chip offline"}>{portfolio.hedgedCount ? "保护中" : "等待触发"}</div>
        </div>
        <div className="active-order-grid">
          {activeHedgeStrategies.map((strategy) => {
            const activeOrder = history.orders.find((item) => item.id === strategy.activeOrderId);
            const activeAnalysis = history.analyses.find((item) => item.id === strategy.activeAnalysisId);
            return <ActiveOrderCard key={strategy.ticker} strategy={strategy} order={activeOrder} analysis={activeAnalysis} onClose={() => closeHedge(strategy.ticker)} running={running} />;
          })}
          {!portfolio.hedgedCount && <div className="no-active-order">
            <b>自动驾驶待命中</b>
            <p>系统会持续巡检 Agent Hub 行情和新闻。只有出现“价格异常”或“高可信利空新闻 + 价格确认”时，才会自动分析并建立对冲。</p>
            <small>触发后这里会自动显示：订单号、开单倍数、方向、数量、成交价格、对冲比例和为什么自动开单。</small>
          </div>}
        </div>
      </section>

      {hasSamsungExchangePosition && !hasSamsungLocalHedge && <section className="orphan-position-panel">
        <div>
          <label>BITGET DEMO 交易所持仓</label>
          <h2>检测到 SAMSUNGUSDT 残留空单</h2>
          <p>交易所 API 当前仍返回 {demoStatus?.currentPositionSize?.toFixed(2)} 张持仓，但本地策略没有 activeOrderId，所以普通对冲卡片不会出现。可以在这里直接平掉 Demo 持仓。</p>
        </div>
        <div className="orphan-position-metrics">
          <Quote label="标的" value="SAMSUNGUSDT" />
          <Quote label="持仓数量" value={`${demoStatus?.currentPositionSize || 0}`} />
          <Quote label="真实杠杆" value="20x" />
          <Quote label="标记价格" value={demoStatus?.markPrice ? money.format(demoStatus.markPrice) : "--"} />
        </div>
        <button type="button" className="close-hedge-button" onClick={closeSamsungExchangePosition} disabled={running}>平掉交易所 Demo 空单</button>
      </section>}

      <section className="live-layout">
        <aside className="control-panel">
          <label>保护策略设置</label>
          <form onSubmit={startOvernightAutopilot}>
            <span className="field-label">运行模式</span>
            <div className="mode-picker">
              <button type="button" className={runMode === "manual" ? "selected" : ""} onClick={() => setRunMode("manual")} disabled={portfolio.enabledCount > 0}>手动观察</button>
              <button type="button" className={runMode === "auto" ? "selected" : ""} onClick={() => setRunMode("auto")} disabled={portfolio.enabledCount > 0}>组合自动驾驶</button>
            </div>
            <span className="field-label">选择股票合约（可多选自动运行）</span>
            <div className="ticker-picker multi-picker">
              {tickers.map((item) => <button type="button" disabled={portfolio.enabledCount > 0} className={`${ticker === item ? "viewing" : ""} ${selectedTickers.includes(item) ? "selected" : ""}`} onClick={() => toggleTicker(item)} key={item}>
                <span>{selectedTickers.includes(item) ? "✓ " : ""}{item}</span>
              </button>)}
            </div>
            <div className="editing-policy">正在设置 <b>{ticker}</b> 的独立策略</div>
            <label htmlFor="position">持仓价值（美元）</label>
            <input id="position" type="number" min="100" value={policies[ticker].positionValue} onChange={(e) => updatePolicy("positionValue", Number(e.target.value))} disabled={portfolio.enabledCount > 0} />
            <label htmlFor="loss">最大可接受亏损（美元）</label>
            <input id="loss" type="number" min="10" value={policies[ticker].maxLoss} onChange={(e) => updatePolicy("maxLoss", Number(e.target.value))} disabled={portfolio.enabledCount > 0} />
            <label htmlFor="threshold">隔夜异常触发阈值（%）</label>
            <input id="threshold" type="number" min="0.1" max="10" step="0.1" value={policies[ticker].anomalyThreshold} onChange={(e) => updatePolicy("anomalyThreshold", Number(e.target.value))} disabled={portfolio.enabledCount > 0} />
            <div className="automation-status">系统每分钟巡检一次。低于阈值时保持观察；只有亏损预算受到威胁时才建立保护，并在开盘后自动验证和结算。</div>
            {!portfolio.enabledCount && runMode === "manual" && <div className="manual-notice">当前为手动观察模式，不会自动分析或下单。选择“组合自动驾驶”后才能启动。</div>}
            {!portfolio.enabledCount && <button type="submit" disabled={running || loading || runMode !== "auto" || selectedTickers.length === 0}>{running ? `正在启动 ${selectedTickers.length} 个策略...` : `启动所选 ${selectedTickers.length} 只股票`}<b>→</b></button>}
            {portfolio.enabledCount > 0 && <div className="manual-notice">组合正在运行。可在上方每只股票的策略卡片中单独查看或停止。</div>}
          </form>
        </aside>

        <section className="market-panel">
          <header>
            <div><strong>{ticker}USDT</strong><span>BITGET 股票合约</span></div>
            <button className="refresh" onClick={loadLive} disabled={loading}>{loading ? "同步中" : "刷新行情"}</button>
          </header>

          {snapshot && <>
            <div className="quote-grid">
              <div className="main-quote"><label>实时标记价格</label><strong>{money.format(snapshot.market.markPrice)}</strong><span className={snapshot.market.change24h >= 0 ? "up" : "down"}>{(snapshot.market.change24h * 100).toFixed(2)}% / 24小时</span></div>
              <Quote label="指数价格" value={money.format(snapshot.market.indexPrice)} />
              <Quote label="买一价 / 卖一价" value={`${snapshot.market.bid.toFixed(2)} / ${snapshot.market.ask.toFixed(2)}`} />
              <Quote label="24小时区间" value={`${snapshot.market.low24h.toFixed(2)}–${snapshot.market.high24h.toFixed(2)}`} />
              <Quote label="资金费率" value={`${(snapshot.market.fundingRate * 100).toFixed(4)}%`} />
            </div>
            <div className="source-time">数据已通过 Bitget Agent Hub 验证 · {new Date(snapshot.market.timestamp).toLocaleString()}</div>

            <div className={`agent-hub-banner hub-${snapshot.services.agentHub}`}>
              <div><label>BITGET AGENT HUB 运行链路</label><strong>官方 Bitget 技能 → BGC 客户端 → 美股合约</strong></div>
              <div><label>行情链路</label><strong>AGENT HUB 已验证</strong><code>{snapshot.agentHub.tickerCallId.slice(0, 12)}</code></div>
              <div><label>K 线链路</label><strong>AGENT HUB 已验证</strong><code>{snapshot.agentHub.candlesCallId.slice(0, 12)}</code></div>
            </div>

            <div className="cross-market-strip">
              <div><label>现货时段</label><strong>{marketStateLabel(snapshot.crossMarket.traditionalMarket)}</strong></div>
              <div><label>定价模式</label><strong>{snapshot.crossMarket.pricingMode === "external-anchor" ? "现货价格锚定" : "休市内部定价"}</strong></div>
              <div><label>标记价 / 指数价偏差</label><strong>{(snapshot.crossMarket.markIndexDivergence * 100).toFixed(3)}%</strong></div>
              <div><label>信号质量</label><strong className={`quality-${snapshot.crossMarket.signalLabel}`}>{signalLabel(snapshot.crossMarket.signalLabel)} · {(snapshot.crossMarket.signalQuality * 100).toFixed(0)}%</strong></div>
            </div>

            <div className={`news-radar news-${snapshot.news.status}`}>
              <div className="section-title"><label>AGENT HUB 新闻雷达</label><span>{newsStatusLabel(snapshot.news.status)} · {new Date(snapshot.news.checkedAt).toLocaleString()}</span></div>
              <p>{snapshot.news.note}</p>
              <div className="news-radar-list">
                {snapshot.news.items.slice(0, 5).map((item) => <a href={item.link} target="_blank" rel="noreferrer" key={`${item.feed}-${item.title}`}>
                  <b>{item.title}</b><small>{item.feed} · {item.published || "时间未提供"}</small>
                </a>)}
                {!snapshot.news.items.length && <div className="news-empty">当前订阅源没有匹配到 {ticker} 或宏观风险标题。这不代表市场没有新闻，系统不会据此盲目开仓。</div>}
              </div>
              {snapshot.news.callId && <code>调用编号 {snapshot.news.callId}</code>}
            </div>

            <div className="bitget-evidence">
              <div className="section-title"><label>BITGET 数据证据</label><span>2 个官方数据工具</span></div>
              <div className="evidence-grid">
                <Quote label="成交额" value={money.format(snapshot.market.quoteVolume)} />
                <Quote label="未平仓量" value={snapshot.market.openInterest.toLocaleString("en-US", { maximumFractionDigits: 2 })} />
                <Quote label="成交量" value={snapshot.market.baseVolume.toLocaleString("en-US", { maximumFractionDigits: 2 })} />
                <Quote label="已加载 K 线" value={`${snapshot.candles.length} × 1小时`} />
              </div>
            </div>
          </>}

          {!snapshot && !loading && <div className="empty">暂时无法获取实时行情。</div>}
        </section>
      </section>

      {analysis && <section className="analysis-panel">
        <div className="analysis-head">
          <div><label>已存证的跨市场分析</label><h2>{analysis.ticker} 下次开盘风险方案</h2></div>
          <div className="mode-chip">{analysis.dataSource === "agent-hub-only" ? "仅使用 AGENT HUB" : analysis.dataSource === "bitget-only" ? "仅使用 BITGET 数据" : "旧版混合数据"} · {analysis.aiMode === "qwen" ? "QWEN 分析" : "本地规则"}</div>
        </div>
        <div className="analysis-grid">
          <Metric label="影子价格区间" value={`${money.format(analysis.shadowLow)}–${money.format(analysis.shadowHigh)}`} accent />
          <Metric label="预期波动" value={`${(analysis.expectedMove * 100).toFixed(2)}%`} />
          <Metric label="风险等级" value={riskLabel(analysis.riskLevel)} accent={analysis.riskLevel === "high" || analysis.riskLevel === "critical"} />
          <Metric label="信号质量" value={`${(analysis.crossMarket.signalQuality * 100).toFixed(0)}% ${signalLabel(analysis.crossMarket.signalLabel)}`} />
          <Metric label="标记价 / 指数价偏差" value={`${(analysis.crossMarket.markIndexDivergence * 100).toFixed(3)}%`} />
          <Metric label="小时波动率" value={`${(analysis.volatility * 100).toFixed(2)}%`} />
          <Metric label="分析置信度" value={`${(analysis.confidence * 100).toFixed(0)}%`} />
          <Metric label="所需对冲比例" value={`${(analysis.hedgeRatio * 100).toFixed(1)}%`} accent />
          <Metric label="对冲名义价值" value={money.format(analysis.hedgeNotional)} />
          <Metric label="合约数量" value={`${analysis.hedgeSize.toFixed(4)} ${analysis.ticker}`} />
          <Metric label="对冲后尾部亏损" value={money.format(analysis.estimatedTailLoss)} />
          <Metric label="预计避免亏损" value={money.format(analysis.estimatedLossAvoided)} accent />
        </div>
        {analysis.newsRisk && <div className="analysis-news-risk">
          <div><label>AGENT HUB 新闻风险</label><strong>{riskLabel(analysis.newsRisk.severity)} · {directionLabel(analysis.newsRisk.direction)}</strong></div>
          <div><label>QWEN 置信度</label><strong>{(analysis.newsRisk.confidence * 100).toFixed(0)}%</strong></div>
          <div><label>影响范围</label><strong>{scopeLabel(analysis.newsRisk.scope)} · {(analysis.newsRisk.affectedTickers || [analysis.ticker]).join("、")}</strong></div>
          <p><b>{analysis.newsRisk.headline || "新闻风险结论"}</b>{analysis.newsRisk.summary}</p>
        </div>}
        <div className="explanation">
          <div><label>判断理由</label><p>{analysis.reasoning}</p></div>
          <div><label>因果链</label><ol>{analysis.causalChain.map((item) => <li key={item}>{item}</li>)}</ol></div>
          <div><label>依据</label><ul>{analysis.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div>
        </div>
        <div className="commit-row">
          <div><label>事前预测存证</label><code>{analysis.commitment}</code><small>{new Date(analysis.createdAt).toLocaleString()}</small></div>
          <div className="action-row">
            <div className="autopilot-result"><b>组合自动驾驶</b><span>{portfolio.enabledCount} 个策略运行中 · {portfolio.hedgedCount} 个已对冲</span></div>
          </div>
        </div>
      </section>}

      {order && <section className="order-ticket">
        <div><label>订单状态</label><strong>{orderStatusLabel(order.status)}</strong></div>
        <div><label>执行模式</label><strong>{order.mode === "bitget-demo" ? "BITGET 模拟盘" : "本地纸面交易"}</strong></div>
        <div><label>操作</label><strong>卖出 {order.size.toFixed(4)} {order.symbol}</strong></div>
        <div><label>模拟成交价</label><strong>{money.format(order.executionPrice ?? order.referencePrice)}</strong></div>
        <div><label>滑点 / 手续费</label><strong>{order.slippageBps ?? 0} 基点 / {money.format(order.estimatedFee ?? 0)}</strong></div>
        <div><label>订单编号</label><code>{order.externalOrderId || order.id.slice(0, 12)}</code></div>
      </section>}

      {settlement && <section className="settlement-ticket">
        <Metric label="实际标记价格" value={money.format(settlement.observedPrice)} />
        <Metric label="区间预测结果" value={settlement.intervalHit ? "命中" : "未命中"} accent />
        <Metric label="未对冲盈亏" value={money.format(settlement.unhedgedPnl)} />
        <Metric label="对冲后盈亏" value={money.format(settlement.hedgedPnl)} />
        <Metric label="避免亏损" value={money.format(settlement.lossAvoided)} accent />
      </section>}

      <section className="audit-panel records-center" id="records-center">
        <div className="analysis-head"><div><label>永久记录中心</label><h2>所有判断、操作与结果</h2><p className="storage-note"><i /> 已保存到本地 SQLite，刷新或重启不会丢失</p></div><div className="record-actions"><a href="/api/evidence" target="_blank" rel="noreferrer">导出审计证据</a><button className="refresh" onClick={loadHistory}>刷新记录</button></div></div>
        <div className="audit-stats">
          <Quote label="Agent Hub 调用" value={String(history.agentHubCalls.length)} />
          <Quote label="Hub 新闻调用" value={String(history.agentHubCalls.filter((item) => item.skill === "news-briefing").length)} />
          <Quote label="Hub 成功调用" value={String(history.agentHubCalls.filter((item) => item.success).length)} />
          <Quote label="Hub 失败记录" value={String(history.agentHubCalls.filter((item) => !item.success).length)} />
          <Quote label="严格模式分析" value={String(history.analyses.filter((item) => item.agentHub?.runtime === "bitget-agent-hub").length)} />
          <Quote label="对冲订单记录" value={String(history.orders.length)} />
        </div>
        <div className="api-proof">
          <div><label>Agent Hub 技能</label><code>bitget-skill / news-briefing</code><strong>运行正常</strong></div>
          <div><label>Hub 行情命令</label><code>futures_get_ticker</code><strong>{history.agentHubCalls.filter((item) => item.command.includes("futures_get_ticker")).length} 次</strong></div>
          <div><label>Hub K线命令</label><code>futures_get_candles</code><strong>{history.agentHubCalls.filter((item) => item.command.includes("futures_get_candles")).length} 次</strong></div>
          <div><label>Hub 新闻命令</label><code>news_feed</code><strong>{history.agentHubCalls.filter((item) => item.command.includes("news_feed")).length} 次</strong></div>
          <div><label>数据策略</label><code>Agent Hub 严格模式</code><strong>无 REST 备用数据</strong></div>
        </div>
        <div className="hub-call-log">
          <div className="section-title"><label>AGENT HUB 可核查调用记录</label><span>命令、端点、耗时与响应哈希</span></div>
          {history.agentHubCalls.slice(0, 12).map((call) => <article key={call.id}>
            <span className={call.success ? "hub-call-ok" : "hub-call-fail"}>{call.success ? "成功" : "失败"}</span>
            <div><b>{call.ticker} · {call.skill === "news-briefing" ? "新闻雷达" : call.command.includes("futures_get_ticker") ? "实时行情" : "1H K线"}</b><code>{call.command}</code></div>
            <div><strong>{call.latencyMs} ms</strong><small>{new Date(call.at).toLocaleString()}</small></div>
            <code>{call.responseHash ? `SHA256 ${call.responseHash.slice(0, 24)}…` : call.error?.slice(0, 100)}</code>
          </article>)}
          {!history.agentHubCalls.length && <div className="empty-log">刷新行情后将显示 Agent Hub 的真实调用证据。</div>}
        </div>
        <div className="record-toolbar">
          <div><label>股票筛选</label><div className="filter-buttons">{["ALL", ...tickers].map((item) => <button type="button" className={recordTicker === item ? "selected" : ""} onClick={() => setRecordTicker(item)} key={item}>{item === "ALL" ? "全部" : item}</button>)}</div></div>
          <div><label>记录类型</label><div className="filter-buttons">{[["ALL", "全部"], ["check", "巡检"], ["news", "新闻"], ["analysis", "AI 分析"], ["hedge", "对冲"], ["settle", "结算"], ["start", "启停"]].map(([value, label]) => <button type="button" className={recordType === value ? "selected" : ""} onClick={() => setRecordType(value)} key={value}>{label}</button>)}</div></div>
        </div>
        <div className="event-timeline">
          {history.events.filter((item) => recordTicker === "ALL" || item.ticker === recordTicker).filter((item) => recordType === "ALL" || item.type === recordType || (recordType === "start" && item.type === "stop")).slice(0, 100).map((item) => <article key={item.id}>
            <div className={`timeline-icon type-${item.type}`}><i /></div>
            <div className="timeline-content"><div><b>{item.title}</b><span className="record-symbol">{item.ticker}</span><time>{new Date(item.at).toLocaleString()}</time></div><p>{item.detail}</p></div>
          </article>)}
          {!history.events.length && <div className="empty">启动自动驾驶后，所有运行记录都会永久显示在这里。</div>}
        </div>
      </section>
    </main>
  );
}

function Status({ name, value, live }: { name: string; value: string; live?: boolean }) {
  return <div><span className={live ? "status-dot on" : "status-dot"} /><label>{name}</label><strong>{value}</strong></div>;
}

function Quote({ label, value }: { label: string; value: string }) {
  return <div className="quote"><label>{label}</label><strong>{value}</strong></div>;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className={accent ? "metric accent" : "metric"}><label>{label}</label><strong>{value}</strong></div>;
}

function RuntimeMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className={accent ? "runtime-metric accent" : "runtime-metric"}><label>{label}</label><strong>{value}</strong></div>;
}

function StrategyCard({ strategy, clock, activeOrder, activeAnalysis, onView, onStop, running }: { strategy: OvernightAutopilot; clock: number; activeOrder?: PaperOrder; activeAnalysis?: LiveAnalysis; onView: () => void; onStop: () => void; running: boolean }) {
  return <article className={`strategy-card strategy-${strategy.status}`}>
    <header>
      <div><b>{strategy.ticker}</b><span className={strategy.enabled ? "strategy-live" : "strategy-off"}>{strategy.enabled ? "运行中" : "已停止"}</span></div>
      <strong>{statusLabel(strategy.status)}</strong>
    </header>
    <div className="strategy-metrics">
      <span><label>持仓</label><b>{money.format(strategy.positionValue)}</b></span>
      <span><label>亏损预算</label><b>{money.format(strategy.maxLoss)}</b></span>
      <span><label>异常阈值</label><b>{(strategy.anomalyThreshold * 100).toFixed(2)}%</b></span>
      <span><label>巡检</label><b>{strategy.checks} 次</b></span>
      <span><label>下次检查</label><b>{strategy.enabled ? formatCountdown(strategy.nextCheckAt, clock) : "--"}</b></span>
      <span><label>对冲</label><b className={strategy.activeOrderId ? "up" : ""}>{strategy.activeOrderId ? "持有中" : "暂无"}</b></span>
    </div>
    <p className="strategy-action">{runtimeActionLabel(strategy.lastAction)}</p>
    {strategy.activeOrderId && <div className="strategy-order">
      <div><label>订单号</label><code>{activeOrder?.externalOrderId || activeOrder?.id.slice(0, 12) || strategy.activeOrderId.slice(0, 12)}</code></div>
      <div><label>开单倍数</label><b>{hedgeLeverageLabel(activeOrder)}</b></div>
      <div><label>开单价格</label><b>{activeOrder?.executionPrice ? money.format(activeOrder.executionPrice) : "--"}</b></div>
      <div><label>对冲比例</label><b>{activeAnalysis ? `${(activeAnalysis.hedgeRatio * 100).toFixed(1)}%` : "--"}</b></div>
      <p><b>为什么开单：</b>{activeAnalysis?.reasoning || strategy.lastAction}</p>
    </div>}
    {strategy.lastNewsRisk && <div className="strategy-news"><label>新闻风险</label><b>{riskLabel(strategy.lastNewsRisk.severity)} · {scopeLabel(strategy.lastNewsRisk.scope)} · {(strategy.lastNewsRisk.confidence * 100).toFixed(0)}%</b><span>{strategy.lastNewsRisk.headline || strategy.lastNewsRisk.summary}</span></div>}
    <div className="mini-log">
      {(strategy.activity || []).slice(0, 3).map((item, index) => <div key={`${item.at}-${index}`}><i className={`activity-dot type-${item.type}`} /><time>{new Date(item.at).toLocaleTimeString()}</time><span>{item.title}</span></div>)}
    </div>
    <footer>
      <button type="button" onClick={onView}>查看行情</button>
      {strategy.enabled && <button type="button" className="card-stop" onClick={onStop} disabled={running || Boolean(strategy.activeOrderId)}>{strategy.activeOrderId ? "对冲持有中" : "停止策略"}</button>}
    </footer>
  </article>;
}

function ActiveOrderCard({ strategy, order, analysis, onClose, running }: { strategy: OvernightAutopilot; order?: PaperOrder; analysis?: LiveAnalysis; onClose: () => void; running: boolean }) {
  return <article className="active-order-card">
    <header>
      <div><label>保护标的</label><b>{strategy.ticker}</b></div>
      <span>{statusLabel(strategy.status)}</span>
    </header>
    <div className="active-order-metrics">
      <Metric label="订单号" value={order?.externalOrderId || order?.id.slice(0, 12) || strategy.activeOrderId?.slice(0, 12) || "--"} accent />
      <Metric label="方向" value={`卖出 / 做空 ${order?.symbol || `${strategy.ticker}USDT`}`} />
      <Metric label="开单倍数" value={hedgeLeverageLabel(order)} />
      <Metric label="数量" value={order ? order.size.toFixed(4) : "--"} />
      <Metric label="成交价格" value={order?.executionPrice ? money.format(order.executionPrice) : "--"} />
      <Metric label="对冲名义价值" value={analysis ? money.format(analysis.hedgeNotional) : "--"} accent />
      <Metric label="对冲比例" value={analysis ? `${(analysis.hedgeRatio * 100).toFixed(1)}%` : "--"} />
      <Metric label="预计避免亏损" value={analysis ? money.format(analysis.estimatedLossAvoided) : "--"} accent />
    </div>
    <div className="active-order-reason">
      <label>为什么自动开单</label>
      <p>{analysis?.reasoning || strategy.lastAction}</p>
      <small>触发后系统会继续持有到下一次美股现货开盘，再自动验证预测并结算记录。</small>
      <button type="button" className="close-hedge-button" onClick={onClose} disabled={running}>{order?.mode === "bitget-demo" ? "取消对冲并平仓 Demo 空单" : "取消纸面对冲"}</button>
    </div>
  </article>;
}

function formatCountdown(target: string | undefined, now: number) {
  if (!target) return "计算中";
  const remaining = new Date(target).getTime() - now;
  if (remaining <= 0) return "巡检中";
  const seconds = Math.floor(remaining / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return days ? `${days}天 ${hours}时 ${minutes}分` : `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function statusLabel(status: OvernightAutopilot["status"]) {
  return { stopped: "已停止", monitoring: "监控中", hedged: "已对冲", "waiting-open": "等待开盘", settled: "已结算", error: "异常" }[status];
}

function marketStateLabel(status: "open" | "closed") {
  return status === "open" ? "交易中" : "已休市";
}

function newsStatusLabel(status?: LiveSnapshot["news"]["status"]) {
  return { available: "有相关新闻", limited: "暂无匹配新闻", unavailable: "暂时不可用" }[status || "unavailable"];
}

function signalLabel(status: LiveSnapshot["crossMarket"]["signalLabel"]) {
  return { strong: "强", usable: "可用", noisy: "噪声较多" }[status];
}

function riskLabel(status: LiveAnalysis["riskLevel"] | NonNullable<LiveAnalysis["newsRisk"]>["severity"]) {
  return { none: "无", low: "低", medium: "中", high: "高", critical: "严重" }[status];
}

function directionLabel(direction: NonNullable<LiveAnalysis["newsRisk"]>["direction"]) {
  return { negative: "利空", neutral: "中性", positive: "利好" }[direction];
}

function scopeLabel(scope?: NonNullable<LiveAnalysis["newsRisk"]>["scope"]) {
  return { company: "公司级", sector: "行业级", macro: "宏观级" }[scope || "company"];
}

function orderStatusLabel(status: string) {
  return ({ "paper-filled": "纸面成交", "paper-cancelled": "纸面已取消", "paper-closed": "纸面已平仓", "paper-closed-data-policy": "因数据策略已归档", "close-required": "需要平仓", "exchange-flat": "交易所已归零", closed: "已平仓" } as Record<string, string>)[status] || status;
}

function hedgeLeverageLabel(order?: PaperOrder) {
  if (!order) return "等待订单回填";
  if (order.leverage) return `${order.leverage}x`;
  if (order.mode === "bitget-demo" && order.symbol === "SAMSUNGUSDT") return "20x";
  return order.mode === "bitget-demo" ? "真实 Demo 杠杆" : "纸面对冲 1x";
}

function runtimeActionLabel(action: string) {
  if (action.startsWith("No anomaly.")) return action.replace("No anomaly. Overnight move", "未发现异常。隔夜波动").replace("is below the", "低于").replace("trigger.", "触发阈值。");
  const labels: Record<string, string> = {
    "Starting overnight baseline assessment.": "正在建立隔夜风险基线。",
    "Overnight monitoring stopped by user.": "用户已停止隔夜监控。",
    "Baseline created. No hedge is opened at startup; waiting for a verified news or price trigger.": "基线已建立。启动时不会直接开仓，正在等待新闻或价格信号确认。",
    "High-risk news detected, but market confirmation is still missing. Monitoring without opening a hedge.": "发现高风险新闻，但尚未得到价格确认，继续监控且不建立对冲。",
    "News risk was confirmed after a sharp fall. Hedge was blocked to avoid chasing the move.": "新闻风险确认时价格已经快速下跌，为避免追空，本轮禁止建立对冲。",
    "Baseline assessment completed. Risk remains inside budget; monitoring silently for an anomaly.": "基线评估完成，风险仍在预算范围内，继续等待异常信号。",
    "Cash market is open. Overnight protection is idle until the closing bell.": "美股现货正在交易，隔夜保护将在收盘后恢复。",
    "Hedge is active. Holding until the next U.S. cash-market open.": "对冲正在持有，等待下一次美股开盘后结算。"
  };
  return labels[action] || action;
}
