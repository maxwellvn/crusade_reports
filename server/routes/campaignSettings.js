import { Router } from "express";
import { requireSuperAdmin } from "../auth.js";
import { isReportingOpen, setReportingOpen, getDefaultLandingPage, setDefaultLandingPage, landingPageOptions,
  isManualZonesEnabled, setManualZonesEnabled, isManualGroupsEnabled, setManualGroupsEnabled,
  isManualCitiesEnabled, setManualCitiesEnabled } from "../appSettings.js";
import { wrap } from "../logger.js";

export const campaignSettings = Router();

export const getCampaignSettings = () => ({
  reporting_open: isReportingOpen(),
  default_landing_page: getDefaultLandingPage(),
  landing_page_options: landingPageOptions(),
  manual_zones_enabled: isManualZonesEnabled(),
  manual_groups_enabled: isManualGroupsEnabled(),
  manual_cities_enabled: isManualCitiesEnabled(),
});

export function updateCampaignSettings(body = {}) {
  if (typeof body.reporting_open === "boolean") setReportingOpen(body.reporting_open);
  if (body.default_landing_page != null) setDefaultLandingPage(body.default_landing_page);
  if (body.manual_zones_enabled != null) setManualZonesEnabled(body.manual_zones_enabled === true);
  if (body.manual_groups_enabled != null) setManualGroupsEnabled(body.manual_groups_enabled === true);
  if (body.manual_cities_enabled != null) setManualCitiesEnabled(body.manual_cities_enabled === true);
  return getCampaignSettings();
}

campaignSettings.get("/", (_req, res) => res.json(getCampaignSettings()));
campaignSettings.put("/", requireSuperAdmin, wrap((req, res) => res.json(updateCampaignSettings(req.body))));
