import { parentPort, workerData } from "node:worker_threads";
import { parsePortalReportWorkbookFile } from "./portalReportTemplate.js";

try {
  const result = await parsePortalReportWorkbookFile(workerData.path);
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({ ok: false, message: error.message, stack: error.stack });
}
