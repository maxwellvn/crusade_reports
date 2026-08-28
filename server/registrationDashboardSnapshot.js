import { Worker, isMainThread } from "node:worker_threads";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { clearDashboardCache } from "./dashboardCache.js";

const SNAPSHOT_KEY = "live-registrations-v1";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let refreshWorker = null;
let refreshQueued = false;

const snapshotStatement = () => db.prepare(`
  SELECT payload, source_max_id, refreshed_at
  FROM registration_dashboard_snapshots WHERE key = ?
`);

export function readRegistrationDashboardSnapshot() {
  const row = snapshotStatement().get(SNAPSHOT_KEY);
  if (!row) return null;
  try {
    return { data: JSON.parse(row.payload), sourceMaxId: row.source_max_id, refreshedAt: row.refreshed_at };
  } catch (error) {
    logger.warn({ err: error }, "registration dashboard snapshot is invalid and will be rebuilt");
    return null;
  }
}

export function saveRegistrationDashboardSnapshot(data) {
  const sourceMaxId = db.prepare("SELECT COALESCE(MAX(id), 0) AS value FROM registration_items").get().value;
  db.prepare(`
    INSERT INTO registration_dashboard_snapshots (key, payload, source_max_id, refreshed_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      payload = excluded.payload,
      source_max_id = excluded.source_max_id,
      refreshed_at = excluded.refreshed_at
  `).run(SNAPSHOT_KEY, JSON.stringify(data), sourceMaxId);
  return { sourceMaxId };
}

export function scheduleRegistrationDashboardRefresh({ force = false } = {}) {
  if (force) clearDashboardCache();
  if (!isMainThread) return false;
  if (refreshWorker) {
    if (force) refreshQueued = true;
    return false;
  }
  const snapshot = readRegistrationDashboardSnapshot();
  const refreshedAt = snapshot ? Date.parse(`${snapshot.refreshedAt.replace(" ", "T")}Z`) : 0;
  if (!force && snapshot && Date.now() - refreshedAt < REFRESH_INTERVAL_MS) return false;

  // Do not inherit dev-server flags such as --watch or --input-type. They are
  // invalid for a worker entry point and would prevent the cache from warming.
  refreshWorker = new Worker(new URL("./workers/refreshRegistrationDashboard.js", import.meta.url), { execArgv: [] });
  refreshWorker.on("message", (message) => {
    if (message?.ok) logger.info({ durationMs: message.durationMs, sourceMaxId: message.sourceMaxId }, "registration dashboard snapshot refreshed");
    else logger.error({ error: message?.error }, "registration dashboard snapshot refresh failed");
  });
  refreshWorker.on("error", (error) => logger.error({ err: error }, "registration dashboard worker failed"));
  refreshWorker.on("exit", () => {
    refreshWorker = null;
    if (refreshQueued) {
      refreshQueued = false;
      scheduleRegistrationDashboardRefresh({ force: true });
    }
  });
  return true;
}

export function registrationDashboardData(build) {
  const snapshot = readRegistrationDashboardSnapshot();
  if (snapshot) {
    const currentMaxId = db.prepare("SELECT COALESCE(MAX(id), 0) AS value FROM registration_items").get().value;
    scheduleRegistrationDashboardRefresh({ force: currentMaxId > snapshot.sourceMaxId });
    return snapshot.data;
  }
  const data = build();
  saveRegistrationDashboardSnapshot(data);
  return data;
}
