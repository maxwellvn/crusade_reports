import { Router } from "express";
import { db, METRIC_FIELDS } from "../db.js";
import { wrap } from "../logger.js";
import { requireAdmin } from "../auth.js";

export const stats = Router();

// Everything aggregates from the crusades fact table — one source, no drift.
const SUMS = METRIC_FIELDS.map((m) => `SUM(${m}) AS ${m}`).join(", ");

// GET /api/stats  -> overall totals + breakdowns by category / zone / network / country / month.
stats.get("/", requireAdmin, wrap((_req, res) => {
  const totals = db.prepare(`SELECT COUNT(*) AS crusades, SUM(attendance) AS attendance, ${SUMS} FROM crusades`).get();

  // attendance = onsite; online_attendance = online_participation. Bars rank by combined reach.
  const by = (col, where = "") =>
    db.prepare(
      `SELECT ${col} AS key, COUNT(*) AS crusades, SUM(attendance) AS attendance,
              SUM(online_participation) AS online_attendance, SUM(salvation) AS salvation
       FROM crusades ${where} GROUP BY ${col} ORDER BY (SUM(attendance) + SUM(online_participation)) DESC`
    ).all();

  res.json({
    totals,
    by_format: by("format"),
    reports: db.prepare("SELECT COUNT(*) AS n FROM reports").get().n,
    by_category: by("event_type"),
    by_org_type: by("organization_type"),
    by_zone: by("zone", "WHERE zone IS NOT NULL"),
    by_group: by("group_name", "WHERE group_name IS NOT NULL"),
    by_church: by("church_name", "WHERE church_name IS NOT NULL"),
    by_network: by("network_name", "WHERE network_name IS NOT NULL"),
    by_country: by("country"),
    by_city: by("city"),
    // Real geocoded city points for the map — no coordinates, no row.
    geo: db.prepare(
      `SELECT city AS key, country, MAX(city_lat) AS lat, MAX(city_lng) AS lng,
              COUNT(*) AS crusades, SUM(attendance) AS attendance,
              SUM(online_participation) AS online_attendance, SUM(salvation) AS salvation
       FROM crusades WHERE city_lat IS NOT NULL GROUP BY city, country`
    ).all(),
    by_month: db.prepare(
      `SELECT substr(event_date,1,7) AS key, COUNT(*) AS crusades, SUM(attendance) AS attendance,
              SUM(online_participation) AS online_attendance, SUM(salvation) AS salvation
       FROM crusades GROUP BY key ORDER BY key`
    ).all(),
    // Planned (registrations) vs held (reported crusades), for progress widgets.
    registered: {
      total: db.prepare("SELECT COALESCE(SUM(planned_count), 0) AS n FROM registration_items").get().n,
      by_type: db.prepare(
        `SELECT event_type AS key, SUM(planned_count) AS planned FROM registration_items GROUP BY event_type`
      ).all(),
      by_zone: db.prepare(
        `SELECT zone AS key, SUM(planned_count) AS planned FROM registration_items WHERE zone IS NOT NULL GROUP BY zone`
      ).all(),
      by_country: db.prepare(
        `SELECT country AS key, SUM(planned_count) AS planned FROM registration_items GROUP BY country`
      ).all(),
    },
    recent: db.prepare(
      `SELECT r.id, r.created_at, r.organization_type, r.zone, r.group_name, r.church_name, r.network_name, r.country,
              COUNT(c.id) AS crusades, SUM(c.attendance) AS attendance, SUM(c.salvation) AS salvation
       FROM reports r LEFT JOIN crusades c ON c.report_id = r.id
       GROUP BY r.id ORDER BY r.created_at DESC LIMIT 10`
    ).all(),
  });
}));
