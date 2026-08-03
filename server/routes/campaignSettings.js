import { Router } from "express";
import { requireSuperAdmin } from "../auth.js";
import { isReportingOpen, setReportingOpen, getDefaultLandingPage, setDefaultLandingPage, landingPageOptions,
  isManualZonesEnabled, setManualZonesEnabled, isManualGroupsEnabled, setManualGroupsEnabled,
  isManualCitiesEnabled, setManualCitiesEnabled } from "../appSettings.js";
import { wrap } from "../logger.js";

export const campaignSettings = Router();

campaignSettings.get("/", (_req, res) => res.json({
  reporting_open: isReportingOpen(),
  default_landing_page: getDefaultLandingPage(),
  landing_page_options: landingPageOptions(),
  manual_zones_enabled: isManualZonesEnabled(),
  manual_groups_enabled: isManualGroupsEnabled(),
  manual_cities_enabled: isManualCitiesEnabled(),
}));
campaignSettings.put("/", requireSuperAdmin, wrap((req, res) => {
  const reportingOpen = req.body?.reporting_open === true;
  setReportingOpen(reportingOpen);
  if (req.body?.default_landing_page != null) setDefaultLandingPage(req.body.default_landing_page);
  if (req.body?.manual_zones_enabled != null) setManualZonesEnabled(req.body.manual_zones_enabled === true);
  if (req.body?.manual_groups_enabled != null) setManualGroupsEnabled(req.body.manual_groups_enabled === true);
  if (req.body?.manual_cities_enabled != null) setManualCitiesEnabled(req.body.manual_cities_enabled === true);
  res.json({
    reporting_open: reportingOpen,
    default_landing_page: getDefaultLandingPage(),
    landing_page_options: landingPageOptions(),
    manual_zones_enabled: isManualZonesEnabled(),
    manual_groups_enabled: isManualGroupsEnabled(),
    manual_cities_enabled: isManualCitiesEnabled(),
  });
}));
