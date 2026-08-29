import { Router } from "express";

import { requireSuperAdmin } from "../auth.js";
import { clearDashboardCache } from "../dashboardCache.js";
import {
  getMyStreamSpacePublicStats,
  setManualMyStreamSpaceAdjustment,
} from "../mystreamspaceStats.js";
import { wrap } from "../logger.js";

export const mystreamspace = Router();

mystreamspace.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getMyStreamSpacePublicStats());
});

mystreamspace.put("/", requireSuperAdmin, wrap((req, res) => {
  setManualMyStreamSpaceAdjustment(req.body);
  clearDashboardCache();
  res.setHeader("Cache-Control", "no-store");
  res.json(getMyStreamSpacePublicStats());
}));
