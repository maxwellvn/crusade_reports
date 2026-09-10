import { parentPort } from "node:worker_threads";
import { db } from "../db.js";
import { buildReportDashboardData } from "../routes/stats.js";
import { saveReportDashboardSnapshot } from "../reportDashboardSnapshot.js";

const startedAt = performance.now();
try {
  const data = buildReportDashboardData();
  const { sourceMaxId } = saveReportDashboardSnapshot(data);
  parentPort?.postMessage({ ok: true, durationMs: Math.round(performance.now() - startedAt), sourceMaxId });
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error.message });
  process.exitCode = 1;
} finally {
  db.close();
}
