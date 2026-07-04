import { Router } from "express";
import { db, METRIC_FIELDS } from "../db.js";
import { wrap } from "../logger.js";
import { requireAdmin } from "../auth.js";

export const crusades = Router();

// Exact-match filters (dropdown-driven); "city" is substring since it's free text.
const FILTER_COLS = ["organization_type", "zone", "group_name", "church_name", "network_name", "country", "event_type", "format"];

// GET /api/crusades — paginated, filtered table backing the "All crusades" view.
crusades.get("/", requireAdmin, wrap((req, res) => {
  const where = [];
  const params = {};

  for (const col of FILTER_COLS) {
    const v = req.query[col];
    if (v) { where.push(`${col} = @${col}`); params[col] = String(v); }
  }
  if (req.query.city) { where.push("city LIKE @city"); params.city = `%${req.query.city}%`; }
  // Free-text search: each word prefix-matches any field via FTS5 ("lag ben" finds
  // Lagos + Pastor Benson rows). Quoted per-token so user input can't break MATCH syntax.
  if (req.query.q) {
    const match = String(req.query.q).trim().split(/\s+/).slice(0, 8)
      .map((t) => `"${t.replace(/"/g, "")}"*`).join(" ");
    if (match.length > 3) {
      where.push("id IN (SELECT rowid FROM crusades_fts WHERE crusades_fts MATCH @q)");
      params.q = match;
    }
  }
  if (req.query.date_from) { where.push("event_date >= @date_from"); params.date_from = String(req.query.date_from); }
  if (req.query.date_to) { where.push("event_date <= @date_to"); params.date_to = String(req.query.date_to); }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageSize = Math.min(Math.max(parseInt(req.query.page_size, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  // Sorting: whitelisted column names only (never interpolate raw query input).
  const NUMERIC_SORT = new Set(["attendance", ...METRIC_FIELDS]);
  const TEXT_SORT = new Set(["event_date", "event_name", "event_type", "format", "city", "country", "organization_type", "minister_name", "venue"]);
  const sortCol = NUMERIC_SORT.has(req.query.sort) || TEXT_SORT.has(req.query.sort) ? req.query.sort : "event_date";
  const dir = req.query.dir === "asc" ? "ASC" : "DESC";
  const orderBy = `${sortCol}${TEXT_SORT.has(sortCol) ? " COLLATE NOCASE" : ""} ${dir}, id DESC`;

  // Full row, every uploaded field — this backs the "show everything received" table.
  const total = db.prepare(`SELECT COUNT(*) AS n FROM crusades ${clause}`).get(params).n;
  const rows = db.prepare(
    `SELECT id, event_date, format, event_type, other_event_type, event_name, city, country,
            organization_type, zone, group_name, church_name, network_name,
            attendance, ${METRIC_FIELDS.join(", ")}, minister_name, venue
     FROM crusades ${clause} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  res.json({ rows, total, page, page_size: pageSize });
}));
