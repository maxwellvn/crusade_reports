import { Worker, isMainThread } from "node:worker_threads";
import { db } from "./db.js";
import { logger } from "./logger.js";

export const REPORT_DASHBOARD_SNAPSHOT_KEY = "reports-dashboard-v3";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let refreshWorker = null;
let refreshPromise = null;

const snapshotStatement = () => db.prepare(`
  SELECT payload, source_max_id, refreshed_at
  FROM registration_dashboard_snapshots WHERE key = ?
`);

export function readReportDashboardSnapshot() {
  const row = snapshotStatement().get(REPORT_DASHBOARD_SNAPSHOT_KEY);
  if (!row) return null;
  try {
    return { data: JSON.parse(row.payload), sourceMaxId: row.source_max_id, refreshedAt: row.refreshed_at };
  } catch (error) {
    logger.warn({ err: error }, "reports dashboard snapshot is invalid and will be rebuilt");
    return null;
  }
}

export function saveReportDashboardSnapshot(data) {
  const sourceMaxId = db.prepare("SELECT COALESCE(MAX(id), 0) AS value FROM crusades").get().value;
  db.prepare(`
    INSERT INTO registration_dashboard_snapshots (key, payload, source_max_id, refreshed_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      payload = excluded.payload,
      source_max_id = excluded.source_max_id,
      refreshed_at = excluded.refreshed_at
  `).run(REPORT_DASHBOARD_SNAPSHOT_KEY, JSON.stringify(data), sourceMaxId);
  return { sourceMaxId };
}

export function scheduleReportDashboardRefresh({ force = false } = {}) {
  if (!isMainThread) return false;
  if (refreshWorker) return false;
  const snapshot = readReportDashboardSnapshot();
  const refreshedAt = snapshot ? Date.parse(`${snapshot.refreshedAt.replace(" ", "T")}Z`) : 0;
  if (!force && snapshot && Date.now() - refreshedAt < REFRESH_INTERVAL_MS) return false;

  refreshWorker = new Worker(new URL("./workers/refreshReportDashboard.js", import.meta.url), { execArgv: [] });
  let settleRefresh;
  refreshPromise = new Promise((resolve) => { settleRefresh = resolve; });
  refreshWorker.on("message", (message) => {
    if (message?.ok) logger.info({ durationMs: message.durationMs, sourceMaxId: message.sourceMaxId }, "reports dashboard snapshot refreshed");
    else logger.error({ error: message?.error }, "reports dashboard snapshot refresh failed");
    settleRefresh(Boolean(message?.ok));
  });
  refreshWorker.on("error", (error) => {
    logger.error({ err: error }, "reports dashboard worker failed");
    settleRefresh(false);
  });
  refreshWorker.on("exit", () => {
    refreshWorker = null;
    settleRefresh(false);
  });
  return true;
}

async function waitForReportDashboardRefresh() {
  scheduleReportDashboardRefresh({ force: true });
  if (refreshPromise) await refreshPromise;
  return readReportDashboardSnapshot();
}

export async function reportDashboardData(build) {
  const snapshot = readReportDashboardSnapshot();
  if (snapshot) {
    const currentMaxId = db.prepare("SELECT COALESCE(MAX(id), 0) AS value FROM crusades").get().value;
    const staleByAge = Date.now() - Date.parse(`${snapshot.refreshedAt.replace(" ", "T")}Z`) >= REFRESH_INTERVAL_MS;
    scheduleReportDashboardRefresh({ force: currentMaxId > snapshot.sourceMaxId || staleByAge });
    return snapshot.data;
  }
  const refreshed = isMainThread ? await waitForReportDashboardRefresh() : null;
  if (refreshed) return refreshed.data;
  const data = build();
  saveReportDashboardSnapshot(data);
  return data;
}
