import { Router } from "express";

import { requireSuperAdmin } from "../auth.js";
import { db } from "../db.js";
import { clearDashboardCache } from "../dashboardCache.js";
import {
  createMyStreamSpaceUpdateToken,
  getMyStreamSpaceUpdateTokenStatus,
  isValidMyStreamSpaceUpdateToken,
  revokeMyStreamSpaceUpdateToken,
} from "../mystreamspaceAccess.js";
import {
  getMyStreamSpacePublicStats,
  setManualMyStreamSpaceAdjustment,
} from "../mystreamspaceStats.js";
import { ApiError, wrap } from "../logger.js";

export const mystreamspace = Router();

mystreamspace.get("/", requireSuperAdmin, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getMyStreamSpacePublicStats());
});

mystreamspace.put("/", requireSuperAdmin, wrap((req, res) => {
  setManualMyStreamSpaceAdjustment(req.body);
  clearDashboardCache();
  res.setHeader("Cache-Control", "no-store");
  res.json(getMyStreamSpacePublicStats());
}));

mystreamspace.get("/link", requireSuperAdmin, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getMyStreamSpaceUpdateTokenStatus(db));
});

mystreamspace.post("/link", requireSuperAdmin, wrap((_req, res) => {
  const generated = createMyStreamSpaceUpdateToken(db);
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json({ ...generated, status: getMyStreamSpaceUpdateTokenStatus(db) });
}));

mystreamspace.delete("/link", requireSuperAdmin, (_req, res) => {
  revokeMyStreamSpaceUpdateToken(db);
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, status: getMyStreamSpaceUpdateTokenStatus(db) });
});

function requireUpdateToken(req) {
  if (!isValidMyStreamSpaceUpdateToken(req.params.token, db)) {
    throw new ApiError(404, "NOT_FOUND", "This MyStreamSpace update link is no longer valid. Ask the administrator for a new link.");
  }
}

mystreamspace.get("/update/:token", wrap((req, res) => {
  requireUpdateToken(req);
  res.setHeader("Cache-Control", "no-store");
  res.json(getMyStreamSpacePublicStats());
}));

mystreamspace.put("/update/:token", wrap((req, res) => {
  requireUpdateToken(req);
  setManualMyStreamSpaceAdjustment(req.body);
  clearDashboardCache();
  res.setHeader("Cache-Control", "no-store");
  res.json(getMyStreamSpacePublicStats());
}));
