import { db } from "./db.js";
import { ApiError } from "./logger.js";

export const isReportingOpen = () => db.prepare("SELECT value FROM app_settings WHERE key = 'reporting_open'").get()?.value === "1";
export const setReportingOpen = (open) => db.prepare(
  "INSERT INTO app_settings (key, value) VALUES ('reporting_open', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
).run(open ? "1" : "0");
export function ensureReportingOpen() {
  if (!isReportingOpen()) throw new ApiError(403, "REPORTING_CLOSED", "Reporting is not open yet.");
}
