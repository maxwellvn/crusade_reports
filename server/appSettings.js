import { db } from "./db.js";
import { ApiError } from "./logger.js";

export const isReportingOpen = () => db.prepare("SELECT value FROM app_settings WHERE key = 'reporting_open'").get()?.value === "1";
export const setReportingOpen = (open) => db.prepare(
  "INSERT INTO app_settings (key, value) VALUES ('reporting_open', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
).run(open ? "1" : "0");
export function ensureReportingOpen() {
  if (!isReportingOpen()) throw new ApiError(403, "REPORTING_CLOSED", "Reporting is not open yet.");
}

// Routes an admin can pick as the post-login / /admin landing page. Constrained
// so a bad value can never brick the redirect — only real admin surface routes.
const LANDING_PAGE_OPTIONS = ["/dashboard", "/registrations/live", "/registrations", "/crusades", "/dashboard/zone-links"];
const LANDING_PAGE_WHITELIST = new Set(LANDING_PAGE_OPTIONS);
const DEFAULT_LANDING_PAGE = "/registrations/live";

export const landingPageOptions = () => [...LANDING_PAGE_OPTIONS];
export const getDefaultLandingPage = () => {
  const value = db.prepare("SELECT value FROM app_settings WHERE key = 'default_landing_page'").get()?.value;
  return LANDING_PAGE_WHITELIST.has(value) ? value : DEFAULT_LANDING_PAGE;
};
export const setDefaultLandingPage = (value) => {
  if (!LANDING_PAGE_WHITELIST.has(value)) throw new ApiError(422, "VALIDATION", "Unsupported landing page.");
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('default_landing_page', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(value);
  return value;
};

// Manual org entry: when enabled, registrants can type a zone/group name that
// isn't in the directory (flagged for admin review). When disabled, they must
// pick from the directory only. Zones default off (directory is authoritative);
// groups default on (new groups appear frequently).
export const isManualZonesEnabled = () => db.prepare("SELECT value FROM app_settings WHERE key = 'manual_zones_enabled'").get()?.value === "1";
export const setManualZonesEnabled = (enabled) => db.prepare(
  "INSERT INTO app_settings (key, value) VALUES ('manual_zones_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
).run(enabled ? "1" : "0");
export const isManualGroupsEnabled = () => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'manual_groups_enabled'").get();
  return row ? row.value === "1" : true; // default on
};
export const setManualGroupsEnabled = (enabled) => db.prepare(
  "INSERT INTO app_settings (key, value) VALUES ('manual_groups_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
).run(enabled ? "1" : "0");
