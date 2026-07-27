import { Router } from "express";
import { db, METRIC_FIELDS } from "../db.js";
import { wrap } from "../logger.js";
import { requireAdmin } from "../auth.js";

export const stats = Router();

// Everything aggregates from the crusades fact table — one source, no drift.
const SUMS = METRIC_FIELDS.map((m) => `SUM(${m}) AS ${m}`).join(", ");

// Registration progress must compare like with like: a registered crusade is
// "held" only after a report has been submitted for that exact item. General
// reports without a registration_item_id still belong in outcome totals, but
// never in planned-vs-held progress. Scoped to program='public' (NULL allowed
// for pre-migration rows) so Blue Elite registrations don't appear here.
//
// BLW campus/region zones (name starts with "BLW") are relabelled as
// "Youths Aglow" in the network_name breakdown so their crusades count under
// Youths Aglow in the admin dashboard widget.
const REGISTRATION_DIMENSIONS = new Set(["event_type", "organization_type", "zone", "network_name", "country", "city"]);
const YOUTHS_AGLOW = "Youths Aglow";
export function registrationProgress(column) {
  if (!REGISTRATION_DIMENSIONS.has(column)) throw new Error(`Unsupported registration dimension: ${column}`);
  const qualified = `ri.${column}`;
  // For network_name, relabel BLW zone rows and youths-aglow event type rows
  // as "Youths Aglow" so they count under Youths Aglow in the admin widget.
  if (column === "network_name") {
    return db.prepare(
      `SELECT CASE WHEN LOWER(ri.zone) LIKE 'blw%' OR ri.event_type = 'youths-aglow' THEN ? ELSE ri.network_name END AS key,
              COALESCE(SUM(ri.planned_count), 0) AS planned,
              COUNT(ri.id) AS items,
              COUNT(c.id) AS held,
              COALESCE(SUM(ri.expected_attendance), 0) AS expected_attendance
       FROM registration_items ri
       LEFT JOIN crusades c ON c.registration_item_id = ri.id
       WHERE (ri.program = 'public' OR ri.program IS NULL)
         AND (ri.network_name IS NOT NULL AND TRIM(ri.network_name) <> '' OR LOWER(ri.zone) LIKE 'blw%' OR ri.event_type = 'youths-aglow')
       GROUP BY key
       ORDER BY planned DESC, key COLLATE NOCASE`
    ).all(YOUTHS_AGLOW);
  }
  return db.prepare(
    `SELECT ${qualified} AS key,
            COALESCE(SUM(ri.planned_count), 0) AS planned,
            COUNT(ri.id) AS items,
            COUNT(c.id) AS held,
            COALESCE(SUM(ri.expected_attendance), 0) AS expected_attendance
     FROM registration_items ri
     LEFT JOIN crusades c ON c.registration_item_id = ri.id
     WHERE (ri.program = 'public' OR ri.program IS NULL)
       AND ${qualified} IS NOT NULL AND TRIM(${qualified}) <> ''
     GROUP BY ${qualified}
     ORDER BY planned DESC, key COLLATE NOCASE`
  ).all();
}

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
    by_cell: by("cell_name", "WHERE cell_name IS NOT NULL"),
    by_network: db.prepare(
      `SELECT CASE WHEN LOWER(zone) LIKE 'blw%' OR event_type = 'youths-aglow' THEN ? ELSE network_name END AS key,
              COUNT(*) AS crusades, SUM(attendance) AS attendance,
              SUM(online_participation) AS online_attendance, SUM(salvation) AS salvation
       FROM crusades
       WHERE network_name IS NOT NULL OR LOWER(zone) LIKE 'blw%' OR event_type = 'youths-aglow'
       GROUP BY key ORDER BY (SUM(attendance) + SUM(online_participation)) DESC`
    ).all(YOUTHS_AGLOW),
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
    // Planned vs held uses only reports linked to the exact registered item.
    // Scoped to public registrations so Blue Elite rows stay out of the existing
    // dashboard's progress numbers.
    registered: {
      ...db.prepare(
        `SELECT COALESCE(SUM(ri.planned_count), 0) AS total,
                COUNT(ri.id) AS items,
                COALESCE(SUM(ri.expected_attendance), 0) AS expected_attendance,
                COUNT(c.id) AS reported,
                COALESCE(SUM(ri.planned_count), 0) - COUNT(c.id) AS awaiting,
                COALESCE(SUM(CASE WHEN ri.readiness_status = 'ready' THEN ri.planned_count ELSE 0 END), 0) AS ready
         FROM registration_items ri
         LEFT JOIN crusades c ON c.registration_item_id = ri.id
         WHERE (ri.program = 'public' OR ri.program IS NULL)`
      ).get(),
      by_type: registrationProgress("event_type"),
      by_org_type: registrationProgress("organization_type"),
      by_zone: registrationProgress("zone"),
      by_network: registrationProgress("network_name"),
      by_country: registrationProgress("country"),
      by_city: registrationProgress("city"),
    },
    recent: db.prepare(
      `SELECT r.id, r.created_at, r.organization_type, r.zone, r.group_name, r.church_name, r.cell_name, r.network_name, r.country,
              COUNT(c.id) AS crusades, SUM(c.attendance) AS attendance, SUM(c.salvation) AS salvation
       FROM reports r LEFT JOIN crusades c ON c.report_id = r.id
       GROUP BY r.id ORDER BY r.created_at DESC LIMIT 10`
    ).all(),
  });
}));
