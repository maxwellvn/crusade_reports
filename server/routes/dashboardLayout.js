import { Router } from "express";
import { db } from "../db.js";
import { wrap, ApiError } from "../logger.js";
import { requirePageAccess } from "../auth.js";

export const dashboardLayout = Router();

// One shared layout row (id=1) — the "admin" surface is just this dashboard,
// editable in place. GET returns null if nobody has customized it yet.
const getStmt = db.prepare("SELECT layout FROM dashboard_layout WHERE id = ?");
const setStmt = db.prepare(
  "INSERT INTO dashboard_layout (id, layout) VALUES (@id, @layout) ON CONFLICT(id) DO UPDATE SET layout = @layout"
);

const layoutId = (req) => req.query.scope === "registrations" ? 2 : 1;
const requireLayoutAccess = (req, res, next) => requirePageAccess(
  req.query.scope === "registrations" ? "registrations/live" : "dashboard"
)(req, res, next);

dashboardLayout.get("/", requireLayoutAccess, wrap((req, res) => {
  const row = getStmt.get(layoutId(req));
  res.json({ layout: row ? JSON.parse(row.layout) : null });
}));

dashboardLayout.put("/", requireLayoutAccess, wrap((req, res) => {
  const layout = req.body?.layout;
  if (!Array.isArray(layout)) throw new ApiError(422, "VALIDATION", "layout must be an array");
  setStmt.run({ id: layoutId(req), layout: JSON.stringify(layout) });
  res.json({ ok: true });
}));
