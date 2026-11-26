import { Worker, isMainThread } from "node:worker_threads";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { clearDashboardCache } from "./dashboardCache.js";
import { DEFAULT_CAMPAIGN, assertCampaign } from "./campaigns.js";

const SNAPSHOT_KEY = "live-registrations-v1";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const refreshWorkers = new Map();
const refreshQueued = new Set();

export const registrationDashboardSnapshotKey = (campaign) => (
  assertCampaign(campaign) === DEFAULT_CAMPAIGN ? SNAPSHOT_KEY : `${SNAPSHOT_KEY}:${campaign}`
);

const snapshotStatement = () => db.prepare(`
  SELECT payload, source_max_id, refreshed_at
  FROM registration_dashboard_snapshots WHERE key = ?
`);

export function readRegistrationDashboardSnapshot(campaign = DEFAULT_CAMPAIGN) {
  const row = snapshotStatement().get(registrationDashboardSnapshotKey(campaign));
  if (!row) return null;
  try {
    return { data: JSON.parse(row.payload), sourceMaxId: row.source_max_id, refreshedAt: row.refreshed_at };
  } catch (error) {
    logger.warn({ err: error }, "registration dashboard snapshot is invalid and will be rebuilt");
    return null;
  }
}

export function saveRegistrationDashboardSnapshot(campaign, data) {
  const sourceMaxId = db.prepare("SELECT COALESCE(MAX(id), 0) AS value FROM registration_items").get().value;
  db.prepare(`
    INSERT INTO registration_dashboard_snapshots (key, payload, source_max_id, refreshed_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      payload = excluded.payload,
      source_max_id = excluded.source_max_id,
      refreshed_at = excluded.refreshed_at
  `).run(registrationDashboardSnapshotKey(campaign), JSON.stringify(data), sourceMaxId);
  return { sourceMaxId };
}

export function scheduleRegistrationDashboardRefresh({ campaign = DEFAULT_CAMPAIGN, force = false } = {}) {
  assertCampaign(campaign);
  if (force) clearDashboardCache();
  if (!isMainThread) return false;
  if (refreshWorkers.has(campaign)) {
    if (force) refreshQueued.add(campaign);
    return false;
  }
  const snapshot = readRegistrationDashboardSnapshot(campaign);
  const refreshedAt = snapshot ? Date.parse(`${snapshot.refreshedAt.replace(" ", "T")}Z`) : 0;
  if (!force && snapshot && Date.now() - refreshedAt < REFRESH_INTERVAL_MS) return false;

  // Do not inherit dev-server flags such as --watch or --input-type. They are
  // invalid for a worker entry point and would prevent the cache from warming.
  const worker = new Worker(new URL("./workers/refreshRegistrationDashboard.js", import.meta.url), { execArgv: [], workerData: { campaign } });
  refreshWorkers.set(campaign, worker);
  worker.on("message", (message) => {
    if (message?.ok) logger.info({ campaign, durationMs: message.durationMs, sourceMaxId: message.sourceMaxId }, "registration dashboard snapshot refreshed");
    else logger.error({ campaign, error: message?.error }, "registration dashboard snapshot refresh failed");
  });
  worker.on("error", (error) => logger.error({ err: error, campaign }, "registration dashboard worker failed"));
  worker.on("exit", () => {
    refreshWorkers.delete(campaign);
    if (refreshQueued.has(campaign)) {
      refreshQueued.delete(campaign);
      scheduleRegistrationDashboardRefresh({ campaign, force: true });
    }
  });
  return true;
}

export function registrationDashboardData(campaign, build) {
  const snapshot = readRegistrationDashboardSnapshot(campaign);
  if (snapshot) {
    const currentMaxId = db.prepare("SELECT COALESCE(MAX(id), 0) AS value FROM registration_items").get().value;
    scheduleRegistrationDashboardRefresh({ campaign, force: currentMaxId > snapshot.sourceMaxId });
    return snapshot.data;
  }
  const data = build(campaign);
  saveRegistrationDashboardSnapshot(campaign, data);
  return data;
}
