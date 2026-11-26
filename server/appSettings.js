import { db } from "./db.js";
import { ApiError } from "./logger.js";
import { INHERITED_NETWORK_NAMES } from "./portalVisibility.js";
import { campaignSettingKey } from "./campaigns.js";

// Campaign-level switches (see CAMPAIGN_SCOPED_SETTINGS): NOTC uses the bare key,
// other campaigns their own `<campaign>:<key>` copy.
const readSetting = (campaign, key) => db.prepare("SELECT value FROM app_settings WHERE key = ?").get(campaignSettingKey(campaign, key))?.value;
const writeSetting = (campaign, key, value) => db.prepare(
  "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
).run(campaignSettingKey(campaign, key), value);

export const isReportingOpen = (campaign) => readSetting(campaign, "reporting_open") === "1";
export const setReportingOpen = (campaign, open) => writeSetting(campaign, "reporting_open", open ? "1" : "0");
export function ensureReportingOpen(campaign) {
  if (!isReportingOpen(campaign)) throw new ApiError(403, "REPORTING_CLOSED", "Reporting is not open yet.");
}

// On by default: spreadsheet uploads skip rows that repeat an existing report
// or an earlier row in the same workbook. Administrators may temporarily turn
// this off when legitimate same-name crusades share a date and location.
export const isSpreadsheetDuplicateProtectionEnabled = (campaign) => {
  const value = readSetting(campaign, "spreadsheet_duplicate_protection_enabled");
  return value === undefined ? true : value === "1";
};
export const setSpreadsheetDuplicateProtectionEnabled = (campaign, enabled) => (
  writeSetting(campaign, "spreadsheet_duplicate_protection_enabled", enabled ? "1" : "0")
);
export const shouldProtectAgainstDuplicateReports = (campaign, submissionSource) => (
  submissionSource !== "spreadsheet" || isSpreadsheetDuplicateProtectionEnabled(campaign)
);

// Off by default: when enabled, independently submitted reports can satisfy an
// organisation's planned count on dashboards without changing report records
// or creating synthetic registration links.
export const isOrganizationReportCreditEnabled = (campaign) => readSetting(campaign, "organization_report_credit_enabled") === "1";
export const setOrganizationReportCreditEnabled = (campaign, enabled) => (
  writeSetting(campaign, "organization_report_credit_enabled", enabled ? "1" : "0")
);

// Routes an admin can pick as the post-login / /admin landing page. Constrained
// so a bad value can never brick the redirect — only real admin surface routes.
const LANDING_PAGE_OPTIONS = ["/dashboard", "/registrations/live", "/registrations", "/crusades", "/dashboard/zone-links"];
const LANDING_PAGE_WHITELIST = new Set(LANDING_PAGE_OPTIONS);
const DEFAULT_LANDING_PAGE = "/registrations/live";

export const landingPageOptions = () => [...LANDING_PAGE_OPTIONS];
export const getDefaultLandingPage = (campaign) => {
  const value = readSetting(campaign, "default_landing_page");
  return LANDING_PAGE_WHITELIST.has(value) ? value : DEFAULT_LANDING_PAGE;
};
export const setDefaultLandingPage = (campaign, value) => {
  if (!LANDING_PAGE_WHITELIST.has(value)) throw new ApiError(422, "VALIDATION", "Unsupported landing page.");
  writeSetting(campaign, "default_landing_page", value);
  return value;
};

// Manual org entry: when enabled, registrants can type a zone/group name that
// isn't in the directory (flagged for admin review). Both default off so a
// missing setting or a fresh deployment always treats the directory as authoritative.
export const isManualZonesEnabled = (campaign) => readSetting(campaign, "manual_zones_enabled") === "1";
export const setManualZonesEnabled = (campaign, enabled) => writeSetting(campaign, "manual_zones_enabled", enabled ? "1" : "0");
export const isManualGroupsEnabled = (campaign) => readSetting(campaign, "manual_groups_enabled") === "1";
export const setManualGroupsEnabled = (campaign, enabled) => writeSetting(campaign, "manual_groups_enabled", enabled ? "1" : "0");
export const isManualCitiesEnabled = (campaign) => {
  const value = readSetting(campaign, "manual_cities_enabled");
  return value === undefined ? true : value === "1"; // default on
};
export const setManualCitiesEnabled = (campaign, enabled) => writeSetting(campaign, "manual_cities_enabled", enabled ? "1" : "0");

// Off by default: private network dashboards normally expose only registrations
// owned by that network. Super admins can temporarily restore the campaign's
// mapped event-type/BLW cross-visibility from Settings.
const networkInheritanceKey = (name) => `network_dashboard_inherited:${name}`;
export const networkDashboardInheritanceSettings = () => Object.fromEntries(
  INHERITED_NETWORK_NAMES.map((name) => [name, db.prepare("SELECT value FROM app_settings WHERE key = ?").get(networkInheritanceKey(name))?.value === "1"]),
);
export const isNetworkDashboardInheritanceEnabled = (name) => (
  INHERITED_NETWORK_NAMES.includes(name)
  && db.prepare("SELECT value FROM app_settings WHERE key = ?").get(networkInheritanceKey(name))?.value === "1"
);
export const setNetworkDashboardInheritanceEnabled = (name, enabled) => {
  if (!INHERITED_NETWORK_NAMES.includes(name)) throw new ApiError(422, "VALIDATION", "Unsupported network dashboard visibility setting.");
  return db.prepare(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(networkInheritanceKey(name), enabled ? "1" : "0");
};
