import { Router } from "express";
import { requireSuperAdmin } from "../auth.js";
import { isReportingOpen, setReportingOpen } from "../appSettings.js";
import { wrap } from "../logger.js";

export const campaignSettings = Router();

campaignSettings.get("/", (_req, res) => res.json({ reporting_open: isReportingOpen() }));
campaignSettings.put("/", requireSuperAdmin, wrap((req, res) => {
  const reportingOpen = req.body?.reporting_open === true;
  setReportingOpen(reportingOpen);
  res.json({ reporting_open: reportingOpen });
}));
