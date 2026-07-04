import { Router } from "express";
import { db } from "../db.js";
import { registrationSchema } from "../validation.js";
import { wrap, ApiError } from "../logger.js";
import { backfillCityCoords } from "./places.js";

export const registrations = Router();

const insertRegStmt = db.prepare(`
  INSERT INTO registrations (organization_type, zone, group_name, church_name, network_name, country, plan_date)
  VALUES (@organization_type, @zone, @group_name, @church_name, @network_name, @country, @plan_date)
`);
const ITEM_COLS = ["registration_id", "organization_type", "zone", "group_name", "church_name", "network_name", "country", "plan_date", "event_type", "planned_count", "city", "city_place_id"];
const insertItemStmt = db.prepare(
  `INSERT INTO registration_items (${ITEM_COLS.join(", ")}) VALUES (${ITEM_COLS.map((c) => "@" + c).join(", ")})`
);

const insertRegistration = db.transaction((d) => {
  const base = {
    organization_type: d.organization_type,
    zone: d.zone || null,
    group_name: d.group_name || null,
    church_name: d.church_name || null,
    network_name: d.network_name || null,
    country: d.country,
    plan_date: d.plan_date,
  };
  const regId = insertRegStmt.run(base).lastInsertRowid;
  for (const it of d.items) {
    insertItemStmt.run({
      ...base,
      registration_id: regId,
      event_type: it.event_type,
      planned_count: it.planned_count,
      city: it.city || null,
      city_place_id: it.city_place_id || null,
    });
  }
  return regId;
});

registrations.post("/", wrap((req, res) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid data");
  const id = insertRegistration(parsed.data);
  backfillCityCoords().catch(() => {});
  res.status(201).json({ id });
}));

// The org display name, dashboard-style: most specific level first.
const ORG_LABEL = "COALESCE(r.church_name, r.group_name, r.network_name, r.zone, r.organization_type)";

// GET /api/registrations/live — everything the live dashboard + landing page need.
registrations.get("/live", wrap((_req, res) => {
  const totals = db.prepare(`
    SELECT (SELECT COUNT(*) FROM registrations) AS registrations,
           COALESCE(SUM(planned_count), 0)      AS planned,
           COUNT(DISTINCT country)              AS countries,
           COUNT(DISTINCT event_type)           AS types
    FROM registration_items
  `).get();

  res.json({
    totals,
    by_type: db.prepare(
      `SELECT event_type AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items GROUP BY event_type ORDER BY planned DESC`
    ).all(),
    by_country: db.prepare(
      `SELECT country AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items GROUP BY country ORDER BY planned DESC`
    ).all(),
    // Real city points (geocoded) for the coverage map.
    geo: db.prepare(
      `SELECT city AS key, country, MAX(city_lat) AS lat, MAX(city_lng) AS lng, SUM(planned_count) AS planned
       FROM registration_items WHERE city_lat IS NOT NULL GROUP BY city, country`
    ).all(),
    // The live feed: latest registrations with their own totals.
    recent: db.prepare(
      `SELECT r.id, r.created_at, r.organization_type, r.country, r.plan_date,
              ${ORG_LABEL} AS org,
              COALESCE(SUM(i.planned_count), 0) AS planned, COUNT(i.id) AS types
       FROM registrations r LEFT JOIN registration_items i ON i.registration_id = r.id
       GROUP BY r.id ORDER BY r.created_at DESC, r.id DESC LIMIT 25`
    ).all(),
  });
}));

// GET /api/registrations — paginated, filtered, sorted table for the admin view.
registrations.get("/", wrap((req, res) => {
  const where = [];
  const params = {};

  for (const col of ["organization_type", "zone", "country"]) {
    if (req.query[col]) { where.push(`r.${col} = @${col}`); params[col] = String(req.query[col]); }
  }
  if (req.query.event_type) {
    where.push("EXISTS (SELECT 1 FROM registration_items x WHERE x.registration_id = r.id AND x.event_type = @event_type)");
    params.event_type = String(req.query.event_type);
  }
  if (req.query.date_from) { where.push("r.plan_date >= @date_from"); params.date_from = String(req.query.date_from); }
  if (req.query.date_to) { where.push("r.plan_date <= @date_to"); params.date_to = String(req.query.date_to); }

  // Free-text search: every word must match some field of the registration or
  // its items. ponytail: LIKE, not FTS — org/city names at this volume don't
  // need an index; clone the crusades_fts pattern if registrations ever do.
  String(req.query.q || "").trim().split(/\s+/).filter(Boolean).slice(0, 8).forEach((tok, n) => {
    const p = `q${n}`;
    where.push(`(r.zone LIKE @${p} OR r.group_name LIKE @${p} OR r.church_name LIKE @${p} OR r.network_name LIKE @${p} OR r.country LIKE @${p}
      OR EXISTS (SELECT 1 FROM registration_items x WHERE x.registration_id = r.id AND (x.city LIKE @${p} OR x.event_type LIKE @${p})))`);
    params[p] = `%${tok}%`;
  });

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageSize = Math.min(Math.max(parseInt(req.query.page_size, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const SORT = { created_at: "r.created_at", plan_date: "r.plan_date", zone: "r.zone COLLATE NOCASE", country: "r.country COLLATE NOCASE", org: "org COLLATE NOCASE", planned: "planned" };
  const sortCol = SORT[req.query.sort] || "r.created_at";
  const dir = req.query.dir === "asc" ? "ASC" : "DESC";

  const total = db.prepare(`SELECT COUNT(*) AS n FROM registrations r ${clause}`).get(params).n;
  const rows = db.prepare(
    `SELECT r.*, ${ORG_LABEL} AS org, COALESCE(SUM(i.planned_count), 0) AS planned
     FROM registrations r LEFT JOIN registration_items i ON i.registration_id = r.id
     ${clause} GROUP BY r.id ORDER BY ${sortCol} ${dir}, r.id DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  // Item breakdowns for just this page's registrations.
  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? db.prepare(`SELECT registration_id, event_type, planned_count, city FROM registration_items
                  WHERE registration_id IN (${ids.map(() => "?").join(",")}) ORDER BY planned_count DESC`).all(...ids)
    : [];

  res.json({ rows, items, total, page, page_size: pageSize });
}));
