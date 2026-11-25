import { Router } from "express";
import { db } from "../db.js";
import { wrap, ApiError } from "../logger.js";
import { requirePageAccess } from "../auth.js";
import { DEFAULT_CAMPAIGN } from "../campaigns.js";

export const dashboardLayout = Router();

// One shared layout row (id=1) — the "admin" surface is just this dashboard,
// editable in place. GET returns null if nobody has customized it yet.
const getStmt = db.prepare("SELECT layout FROM dashboard_layout WHERE id = ?");
const setStmt = db.prepare(
  "INSERT INTO dashboard_layout (id, layout) VALUES (@id, @layout) ON CONFLICT(id) DO UPDATE SET layout = @layout"
);
const getCampaignStmt = db.prepare("SELECT layout FROM campaign_dashboard_layout WHERE campaign = ? AND id = ?");
const setCampaignStmt = db.prepare(
  "INSERT INTO campaign_dashboard_layout (campaign, id, layout) VALUES (@campaign, @id, @layout) ON CONFLICT(campaign, id) DO UPDATE SET layout = @layout"
);

const layoutId = (req) => req.query.scope === "registrations" ? 2 : 1;
const requireLayoutAccess = (req, res, next) => requirePageAccess(
  req.query.scope === "registrations" ? "registrations/live" : "dashboard"
)(req, res, next);

dashboardLayout.get("/", requireLayoutAccess, wrap((req, res) => {
  const id = layoutId(req);
  const row = req.campaign === DEFAULT_CAMPAIGN ? getStmt.get(id) : getCampaignStmt.get(req.campaign, id);
  res.json({ layout: row ? JSON.parse(row.layout) : null });
}));

dashboardLayout.put("/", requireLayoutAccess, wrap((req, res) => {
  const layout = req.body?.layout;
  if (!Array.isArray(layout)) throw new ApiError(422, "VALIDATION", "layout must be an array");
  const values = { campaign: req.campaign, id: layoutId(req), layout: JSON.stringify(layout) };
  if (req.campaign === DEFAULT_CAMPAIGN) setStmt.run(values);
  else setCampaignStmt.run(values);
  res.json({ ok: true });
}));
