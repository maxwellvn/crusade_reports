import { Router } from "express";
import { requireSuperAdmin } from "../auth.js";
import { isReportingOpen, setReportingOpen, getDefaultLandingPage, setDefaultLandingPage, landingPageOptions } from "../appSettings.js";
import { wrap } from "../logger.js";

export const campaignSettings = Router();

campaignSettings.get("/", (_req, res) => res.json({
  reporting_open: isReportingOpen(),
  default_landing_page: getDefaultLandingPage(),
  landing_page_options: landingPageOptions(),
}));
campaignSettings.put("/", requireSuperAdmin, wrap((req, res) => {
  const reportingOpen = req.body?.reporting_open === true;
  setReportingOpen(reportingOpen);
  if (req.body?.default_landing_page != null) setDefaultLandingPage(req.body.default_landing_page);
  res.json({
    reporting_open: reportingOpen,
    default_landing_page: getDefaultLandingPage(),
    landing_page_options: landingPageOptions(),
  });
}));
