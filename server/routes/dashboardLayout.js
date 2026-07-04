import { Router } from "express";
import { db } from "../db.js";
import { wrap, ApiError } from "../logger.js";

export const dashboardLayout = Router();

// One shared layout row (id=1) — the "admin" surface is just this dashboard,
// editable in place. GET returns null if nobody has customized it yet.
const getStmt = db.prepare("SELECT layout FROM dashboard_layout WHERE id = 1");
const setStmt = db.prepare(
  "INSERT INTO dashboard_layout (id, layout) VALUES (1, @layout) ON CONFLICT(id) DO UPDATE SET layout = @layout"
);

dashboardLayout.get("/", wrap((_req, res) => {
  const row = getStmt.get();
  res.json({ layout: row ? JSON.parse(row.layout) : null });
}));

dashboardLayout.put("/", wrap((req, res) => {
  const layout = req.body?.layout;
  if (!Array.isArray(layout)) throw new ApiError(422, "VALIDATION", "layout must be an array");
  setStmt.run({ layout: JSON.stringify(layout) });
  res.json({ ok: true });
}));
