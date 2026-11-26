import { Router } from "express";
import { requireSuperAdmin } from "../auth.js";
import { isReportingOpen, setReportingOpen, getDefaultLandingPage, setDefaultLandingPage, landingPageOptions,
  isManualZonesEnabled, setManualZonesEnabled, isManualGroupsEnabled, setManualGroupsEnabled,
  isManualCitiesEnabled, setManualCitiesEnabled,
  isSpreadsheetDuplicateProtectionEnabled, setSpreadsheetDuplicateProtectionEnabled,
  isOrganizationReportCreditEnabled, setOrganizationReportCreditEnabled,
  networkDashboardInheritanceSettings, setNetworkDashboardInheritanceEnabled } from "../appSettings.js";
import { wrap } from "../logger.js";
import { clearDashboardCache } from "../dashboardCache.js";
import { scheduleReportDashboardRefresh } from "../reportDashboardSnapshot.js";
import { DEFAULT_CAMPAIGN, campaignPublicConfig } from "../campaigns.js";

export const campaignSettings = Router();

// Network dashboard inheritance belongs to NOTC's network programme, so other
// campaigns neither see nor change it.
export const getCampaignSettings = (campaign) => ({
  campaign: campaignPublicConfig(campaign),
  reporting_open: isReportingOpen(campaign),
  default_landing_page: getDefaultLandingPage(campaign),
  landing_page_options: landingPageOptions(),
  manual_zones_enabled: isManualZonesEnabled(campaign),
  manual_groups_enabled: isManualGroupsEnabled(campaign),
  manual_cities_enabled: isManualCitiesEnabled(campaign),
  spreadsheet_duplicate_protection_enabled: isSpreadsheetDuplicateProtectionEnabled(campaign),
  organization_report_credit_enabled: isOrganizationReportCreditEnabled(campaign),
  ...(campaign === DEFAULT_CAMPAIGN && { network_dashboard_inherited_crusades: networkDashboardInheritanceSettings() }),
});

export function updateCampaignSettings(campaign, body = {}) {
  if (typeof body.reporting_open === "boolean") setReportingOpen(campaign, body.reporting_open);
  if (body.default_landing_page != null) setDefaultLandingPage(campaign, body.default_landing_page);
  if (body.manual_zones_enabled != null) setManualZonesEnabled(campaign, body.manual_zones_enabled === true);
  if (body.manual_groups_enabled != null) setManualGroupsEnabled(campaign, body.manual_groups_enabled === true);
  if (body.manual_cities_enabled != null) setManualCitiesEnabled(campaign, body.manual_cities_enabled === true);
  if (body.spreadsheet_duplicate_protection_enabled != null) {
    setSpreadsheetDuplicateProtectionEnabled(campaign, body.spreadsheet_duplicate_protection_enabled === true);
  }
  if (body.organization_report_credit_enabled != null) {
    setOrganizationReportCreditEnabled(campaign, body.organization_report_credit_enabled === true);
  }
  if (campaign === DEFAULT_CAMPAIGN && body.network_dashboard_inherited_crusades && typeof body.network_dashboard_inherited_crusades === "object") {
    for (const [name, enabled] of Object.entries(body.network_dashboard_inherited_crusades)) {
      setNetworkDashboardInheritanceEnabled(name, enabled === true);
    }
  }
  clearDashboardCache();
  return getCampaignSettings(campaign);
}

function responseSettings(req, settings) {
  if (req.query.include_campaign === "1") return settings;
  const { campaign: _campaign, ...legacySettings } = settings;
  return legacySettings;
}

campaignSettings.get("/", (req, res) => res.json(responseSettings(req, getCampaignSettings(req.campaign))));
campaignSettings.put("/", requireSuperAdmin, wrap((req, res) => {
  const settings = updateCampaignSettings(req.campaign, req.body);
  scheduleReportDashboardRefresh({ campaign: req.campaign, force: true });
  res.json(responseSettings(req, settings));
}));
