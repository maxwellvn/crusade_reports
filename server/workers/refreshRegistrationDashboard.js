import { parentPort } from "node:worker_threads";
import { db } from "../db.js";
import { buildRegistrationLiveData } from "../routes/registrations.js";
import { saveRegistrationDashboardSnapshot } from "../registrationDashboardSnapshot.js";

// This worker owns the expensive aggregate scan so the HTTP event loop stays responsive.
const startedAt = performance.now();
try {
  const data = buildRegistrationLiveData();
  const { sourceMaxId } = saveRegistrationDashboardSnapshot(data);
  parentPort?.postMessage({ ok: true, durationMs: Math.round(performance.now() - startedAt), sourceMaxId });
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error.message });
  process.exitCode = 1;
} finally {
  db.close();
}
