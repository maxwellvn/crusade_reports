import { Worker, isMainThread } from "node:worker_threads";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { DEFAULT_CAMPAIGN, assertCampaign } from "./campaigns.js";

export const REPORT_DASHBOARD_SNAPSHOT_KEY = "reports-dashboard-v3";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const refreshWorkers = new Map();
const refreshPromises = new Map();

// NOTC keeps the original snapshot key; other campaigns get their own row.
export const reportDashboardSnapshotKey = (campaign) => (
  assertCampaign(campaign) === DEFAULT_CAMPAIGN ? REPORT_DASHBOARD_SNAPSHOT_KEY : `${REPORT_DASHBOARD_SNAPSHOT_KEY}:${campaign}`
);

const snapshotStatement = () => db.prepare(`
  SELECT payload, source_max_id, refreshed_at
  FROM registration_dashboard_snapshots WHERE key = ?
`);

// Global on purpose: MAX(id) stays a rowid lookup, and a new row in any
// campaign only costs an extra refresh.
const maxCrusadeId = () => db.prepare("SELECT COALESCE(MAX(id), 0) AS value FROM crusades").get().value;

export function readReportDashboardSnapshot(campaign) {
  const row = snapshotStatement().get(reportDashboardSnapshotKey(campaign));
  if (!row) return null;
  try {
    return { data: JSON.parse(row.payload), sourceMaxId: row.source_max_id, refreshedAt: row.refreshed_at };
  } catch (error) {
    logger.warn({ err: error, campaign }, "reports dashboard snapshot is invalid and will be rebuilt");
    return null;
  }
}

export function saveReportDashboardSnapshot(campaign, data) {
  const sourceMaxId = maxCrusadeId();
  db.prepare(`
    INSERT INTO registration_dashboard_snapshots (key, payload, source_max_id, refreshed_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      payload = excluded.payload,
      source_max_id = excluded.source_max_id,
      refreshed_at = excluded.refreshed_at
  `).run(reportDashboardSnapshotKey(campaign), JSON.stringify(data), sourceMaxId);
  return { sourceMaxId };
}

export function scheduleReportDashboardRefresh({ campaign = DEFAULT_CAMPAIGN, force = false } = {}) {
  assertCampaign(campaign);
  if (!isMainThread) return false;
  if (refreshWorkers.has(campaign)) return false;
  const snapshot = readReportDashboardSnapshot(campaign);
  const refreshedAt = snapshot ? Date.parse(`${snapshot.refreshedAt.replace(" ", "T")}Z`) : 0;
  if (!force && snapshot && Date.now() - refreshedAt < REFRESH_INTERVAL_MS) return false;

  const worker = new Worker(new URL("./workers/refreshReportDashboard.js", import.meta.url), { execArgv: [], workerData: { campaign } });
  refreshWorkers.set(campaign, worker);
  let settleRefresh;
  refreshPromises.set(campaign, new Promise((resolve) => { settleRefresh = resolve; }));
  worker.on("message", (message) => {
    if (message?.ok) logger.info({ campaign, durationMs: message.durationMs, sourceMaxId: message.sourceMaxId }, "reports dashboard snapshot refreshed");
    else logger.error({ campaign, error: message?.error }, "reports dashboard snapshot refresh failed");
    settleRefresh(Boolean(message?.ok));
  });
  worker.on("error", (error) => {
    logger.error({ err: error, campaign }, "reports dashboard worker failed");
    settleRefresh(false);
  });
  worker.on("exit", () => {
    refreshWorkers.delete(campaign);
    settleRefresh(false);
  });
  return true;
}

async function waitForReportDashboardRefresh(campaign) {
  scheduleReportDashboardRefresh({ campaign, force: true });
  if (refreshPromises.has(campaign)) await refreshPromises.get(campaign);
  return readReportDashboardSnapshot(campaign);
}

export async function reportDashboardData(campaign, build) {
  const snapshot = readReportDashboardSnapshot(campaign);
  if (snapshot) {
    const staleByAge = Date.now() - Date.parse(`${snapshot.refreshedAt.replace(" ", "T")}Z`) >= REFRESH_INTERVAL_MS;
    scheduleReportDashboardRefresh({ campaign, force: maxCrusadeId() > snapshot.sourceMaxId || staleByAge });
    return snapshot.data;
  }
  const refreshed = isMainThread ? await waitForReportDashboardRefresh(campaign) : null;
  if (refreshed) return refreshed.data;
  const data = build(campaign);
  saveReportDashboardSnapshot(campaign, data);
  return data;
}
