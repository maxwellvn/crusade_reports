import { parentPort, workerData } from "node:worker_threads";
import { db } from "../db.js";
import { buildRegistrationLiveData } from "../routes/registrations.js";
import { saveRegistrationDashboardSnapshot } from "../registrationDashboardSnapshot.js";

// This worker owns the expensive aggregate scan so the HTTP event loop stays responsive.
const startedAt = performance.now();
try {
  const { campaign } = workerData;
  const data = buildRegistrationLiveData(campaign);
  const { sourceMaxId } = saveRegistrationDashboardSnapshot(campaign, data);
  parentPort?.postMessage({ ok: true, durationMs: Math.round(performance.now() - startedAt), sourceMaxId });
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error.message });
  process.exitCode = 1;
} finally {
  db.close();
}
