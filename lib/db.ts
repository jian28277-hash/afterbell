import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { AgentHubCall, AutopilotEvent, BitgetApiCall, DemoExecutionRun, LiveAnalysis, OvernightAutopilot, PaperOrder, Settlement, SimulationScenario } from "./live-types";

const dataDir = join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, "afterbell.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS paper_orders (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS demo_execution_runs (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_demo_execution_runs_created_at ON demo_execution_runs(created_at DESC);
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS autopilot_events (
    id TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    created_at TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_autopilot_events_created_at ON autopilot_events(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_autopilot_events_ticker ON autopilot_events(ticker, created_at DESC);
  CREATE TABLE IF NOT EXISTS bitget_api_calls (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    ticker TEXT NOT NULL,
    symbol TEXT NOT NULL,
    status INTEGER NOT NULL,
    success INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_bitget_calls_created_at ON bitget_api_calls(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bitget_calls_endpoint ON bitget_api_calls(endpoint, created_at DESC);
  CREATE TABLE IF NOT EXISTS agent_hub_calls (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    skill TEXT NOT NULL,
    command TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    ticker TEXT NOT NULL,
    symbol TEXT NOT NULL,
    success INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    response_hash TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_agent_hub_calls_created_at ON agent_hub_calls(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_hub_calls_endpoint ON agent_hub_calls(endpoint, created_at DESC);
`);

const eventCount = db.prepare("SELECT COUNT(*) AS count FROM autopilot_events").get() as { count: number };
if (eventCount.count === 0) {
  const legacyStates = db.prepare("SELECT payload FROM app_state WHERE key LIKE 'overnight-autopilot:%'").all() as Array<{ payload: string }>;
  const insertEvent = db.prepare("INSERT INTO autopilot_events (id, ticker, created_at, type, title, detail) VALUES (?, ?, ?, ?, ?, ?)");
  for (const row of legacyStates) {
    const state = JSON.parse(row.payload) as OvernightAutopilot;
    for (const event of state.activity || []) {
      insertEvent.run(randomUUID(), state.ticker, event.at, event.type, event.title, event.detail);
    }
  }
}

export function saveAnalysis(analysis: LiveAnalysis) {
  db.prepare("INSERT OR REPLACE INTO analyses (id, created_at, payload) VALUES (?, ?, ?)")
    .run(analysis.id, analysis.createdAt, JSON.stringify(analysis));
}

export function getAnalysis(id: string): LiveAnalysis | null {
  const row = db.prepare("SELECT payload FROM analyses WHERE id = ?").get(id) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) as LiveAnalysis : null;
}

export function savePaperOrder(order: PaperOrder) {
  db.prepare("INSERT OR REPLACE INTO paper_orders (id, analysis_id, created_at, payload) VALUES (?, ?, ?, ?)")
    .run(order.id, order.analysisId, order.createdAt, JSON.stringify(order));
  return order;
}

export function getPaperOrderForAnalysis(analysisId: string): PaperOrder | null {
  const row = db.prepare("SELECT payload FROM paper_orders WHERE analysis_id = ? ORDER BY created_at DESC LIMIT 1").get(analysisId) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) as PaperOrder : null;
}

export function getPaperOrder(id: string): PaperOrder | null {
  const row = db.prepare("SELECT payload FROM paper_orders WHERE id = ?").get(id) as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) as PaperOrder : null;
}

export function saveDemoExecutionRun(run: DemoExecutionRun) {
  db.prepare("INSERT OR REPLACE INTO demo_execution_runs (id, created_at, payload) VALUES (?, ?, ?)")
    .run(run.id, run.createdAt, JSON.stringify(run));
  return run;
}

export function getDemoExecutionRuns(limit = 100): DemoExecutionRun[] {
  const rows = db.prepare("SELECT payload FROM demo_execution_runs ORDER BY created_at DESC LIMIT ?")
    .all(Math.min(500, Math.max(1, limit))) as Array<{ payload: string }>;
  return rows.map((row) => JSON.parse(row.payload) as DemoExecutionRun);
}

const defaultAutopilot: OvernightAutopilot = {
  enabled: false, ticker: "NVDA", positionValue: 100000, maxLoss: 1500,
  anomalyThreshold: 0.005, status: "stopped", lastAction: "Overnight monitoring is stopped.", checks: 0, activity: []
};

export function getAutopilot(ticker: string): OvernightAutopilot {
  const normalized = ticker.toUpperCase();
  const row = db.prepare("SELECT payload FROM app_state WHERE key = ?").get(`overnight-autopilot:${normalized}`) as { payload: string } | undefined;
  return row ? { ...defaultAutopilot, ticker: normalized, ...JSON.parse(row.payload) } : { ...defaultAutopilot, ticker: normalized, activity: [] };
}

export function saveAutopilot(config: OvernightAutopilot) {
  db.prepare("INSERT OR REPLACE INTO app_state (key, payload) VALUES (?, ?)").run(`overnight-autopilot:${config.ticker.toUpperCase()}`, JSON.stringify(config));
  return config;
}

export function saveSimulationScenario(scenario: SimulationScenario) {
  db.prepare("INSERT OR REPLACE INTO app_state (key, payload) VALUES (?, ?)")
    .run(`simulation-news:${scenario.ticker.toUpperCase()}`, JSON.stringify(scenario));
  return scenario;
}

export function getSimulationScenario(ticker: string): SimulationScenario | null {
  const row = db.prepare("SELECT payload FROM app_state WHERE key = ?").get(`simulation-news:${ticker.toUpperCase()}`) as { payload: string } | undefined;
  if (!row) return null;
  const scenario = JSON.parse(row.payload) as SimulationScenario;
  if (new Date(scenario.expiresAt).getTime() <= Date.now()) {
    clearSimulationScenario(ticker);
    return null;
  }
  return scenario;
}

export function clearSimulationScenario(ticker: string) {
  db.prepare("DELETE FROM app_state WHERE key = ?").run(`simulation-news:${ticker.toUpperCase()}`);
}

export function saveAutopilotEvent(ticker: string, event: OvernightAutopilot["activity"][number]) {
  const record: AutopilotEvent = { id: randomUUID(), ticker: ticker.toUpperCase(), ...event };
  db.prepare("INSERT INTO autopilot_events (id, ticker, created_at, type, title, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .run(record.id, record.ticker, record.at, record.type, record.title, record.detail);
  return record;
}

export function getAutopilotEvents(limit = 200, ticker?: string): AutopilotEvent[] {
  const safeLimit = Math.min(1000, Math.max(1, limit));
  const rows = ticker
    ? db.prepare("SELECT id, ticker, created_at, type, title, detail FROM autopilot_events WHERE ticker = ? ORDER BY created_at DESC LIMIT ?").all(ticker.toUpperCase(), safeLimit)
    : db.prepare("SELECT id, ticker, created_at, type, title, detail FROM autopilot_events ORDER BY created_at DESC LIMIT ?").all(safeLimit);
  return (rows as Array<{ id: string; ticker: string; created_at: string; type: AutopilotEvent["type"]; title: string; detail: string }>).map((row) => ({
    id: row.id, ticker: row.ticker, at: row.created_at, type: row.type, title: row.title, detail: row.detail
  }));
}

export function saveBitgetApiCall(call: Omit<BitgetApiCall, "id">) {
  const record: BitgetApiCall = { id: randomUUID(), ...call };
  db.prepare("INSERT INTO bitget_api_calls (id, created_at, endpoint, ticker, symbol, status, success, latency_ms, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(record.id, record.at, record.endpoint, record.ticker, record.symbol, record.status, record.success ? 1 : 0, record.latencyMs, record.error || null);
  return record;
}

export function getBitgetApiCalls(limit = 500): BitgetApiCall[] {
  const rows = db.prepare("SELECT id, created_at, endpoint, ticker, symbol, status, success, latency_ms, error FROM bitget_api_calls ORDER BY created_at DESC LIMIT ?").all(Math.min(2000, Math.max(1, limit)));
  return (rows as Array<{ id: string; created_at: string; endpoint: string; ticker: string; symbol: string; status: number; success: number; latency_ms: number; error?: string }>).map((row) => ({
    id: row.id, at: row.created_at, endpoint: row.endpoint, ticker: row.ticker, symbol: row.symbol,
    status: row.status, success: Boolean(row.success), latencyMs: row.latency_ms, error: row.error
  }));
}

export function saveAgentHubCall(call: Omit<AgentHubCall, "id">) {
  const record: AgentHubCall = { id: randomUUID(), ...call };
  db.prepare("INSERT INTO agent_hub_calls (id, created_at, skill, command, endpoint, ticker, symbol, success, latency_ms, response_hash, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(record.id, record.at, record.skill, record.command, record.endpoint, record.ticker, record.symbol, record.success ? 1 : 0, record.latencyMs, record.responseHash || null, record.error || null);
  return record;
}

export function getAgentHubCalls(limit = 500): AgentHubCall[] {
  const rows = db.prepare("SELECT id, created_at, skill, command, endpoint, ticker, symbol, success, latency_ms, response_hash, error FROM agent_hub_calls ORDER BY created_at DESC LIMIT ?").all(Math.min(2000, Math.max(1, limit)));
  return (rows as Array<{ id: string; created_at: string; skill: "bitget" | "news-briefing"; command: string; endpoint: string; ticker: string; symbol: string; success: number; latency_ms: number; response_hash?: string; error?: string }>).map((row) => ({
    id: row.id, at: row.created_at, skill: row.skill, command: row.command, endpoint: row.endpoint,
    ticker: row.ticker, symbol: row.symbol, success: Boolean(row.success), latencyMs: row.latency_ms,
    responseHash: row.response_hash, error: row.error
  }));
}

export function getAutopilots(): OvernightAutopilot[] {
  const rows = db.prepare("SELECT payload FROM app_state WHERE key LIKE 'overnight-autopilot:%' ORDER BY key").all() as Array<{ payload: string }>;
  return rows.map((row) => ({ ...defaultAutopilot, ...JSON.parse(row.payload) } as OvernightAutopilot));
}

export function saveSettlement(settlement: Settlement) {
  db.prepare("INSERT OR REPLACE INTO settlements (id, analysis_id, created_at, payload) VALUES (?, ?, ?, ?)")
    .run(settlement.id, settlement.analysisId, settlement.createdAt, JSON.stringify(settlement));
}

export function getHistory() {
  const analyses = db.prepare("SELECT payload FROM analyses ORDER BY created_at DESC LIMIT 200").all() as Array<{ payload: string }>;
  const orders = db.prepare("SELECT payload FROM paper_orders ORDER BY created_at DESC LIMIT 200").all() as Array<{ payload: string }>;
  const settlements = db.prepare("SELECT payload FROM settlements ORDER BY created_at DESC LIMIT 200").all() as Array<{ payload: string }>;
  return {
    analyses: analyses.map((row) => JSON.parse(row.payload) as LiveAnalysis),
    orders: orders.map((row) => JSON.parse(row.payload) as PaperOrder),
    demoExecutions: getDemoExecutionRuns(200),
    settlements: settlements.map((row) => JSON.parse(row.payload) as Settlement),
    events: getAutopilotEvents(500),
    apiCalls: getBitgetApiCalls(1000),
    agentHubCalls: getAgentHubCalls(1000)
  };
}
