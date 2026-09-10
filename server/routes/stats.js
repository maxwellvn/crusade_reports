import { Router } from "express";
import { db, METRIC_FIELDS } from "../db.js";
import { wrap } from "../logger.js";
import { requirePageAccess } from "../auth.js";
import { resolveCountryName } from "./countries.js";
import { applyMyStreamSpaceAdjustment, getManualMyStreamSpaceAdjustment } from "../mystreamspaceStats.js";
import { isOrganizationReportCreditEnabled } from "../appSettings.js";
import { reportDashboardData } from "../reportDashboardSnapshot.js";

export const stats = Router();

// Everything aggregates from the crusades fact table — one source, no drift.
const SUMS = METRIC_FIELDS.map((m) => `SUM(${m}) AS ${m}`).join(", ");
export const RHAPSODY_END_TIME_START_DATE = "2026-09-01";

export function rhapsodyEndTimeSummary(database = db) {
  const totals = database.prepare(`
    SELECT COUNT(*) AS crusades,
           COALESCE(SUM(attendance), 0) AS attendance,
           COALESCE(SUM(online_participation), 0) AS online_attendance,
           COALESCE(SUM(salvation), 0) AS salvation
    FROM crusades
    WHERE event_date >= ?
  `).get(RHAPSODY_END_TIME_START_DATE);
  const countries = database.prepare(`
    SELECT DISTINCT TRIM(country) AS country
    FROM crusades
    WHERE event_date >= ? AND country IS NOT NULL AND TRIM(country) <> ''
  `).all(RHAPSODY_END_TIME_START_DATE);
  totals.countries = new Set(countries.map(({ country }) => resolveCountryName(country) || country.toLowerCase())).size;

  const byType = database.prepare(`
    SELECT event_type AS key, COUNT(*) AS crusades,
           COALESCE(SUM(attendance), 0) AS attendance,
           COALESCE(SUM(online_participation), 0) AS online_attendance,
           COALESCE(SUM(salvation), 0) AS salvation
    FROM crusades
    WHERE event_date >= ?
    GROUP BY event_type
    ORDER BY crusades DESC, key COLLATE NOCASE
  `).all(RHAPSODY_END_TIME_START_DATE);

  const recent = database.prepare(`
    SELECT id, event_date, event_name, event_type, other_event_type, city, country, zone, network_name
    FROM crusades
    WHERE event_date >= ?
    ORDER BY event_date DESC, id DESC
    LIMIT 6
  `).all(RHAPSODY_END_TIME_START_DATE);

  return { start_date: RHAPSODY_END_TIME_START_DATE, totals, by_type: byType, recent };
}

// Registration progress compares planned registrations with held reports.
// Default: a crusade is held only after a report is linked to that exact item.
// When organization report credit is on, unlinked reports for the same
// organisation also count, capped at that organisation's planned total.
// Scoped to program='public' (NULL allowed for pre-migration rows) so Blue
// Elite registrations don't appear here.
const REGISTRATION_DIMENSIONS = new Set(["event_type", "organization_type", "zone", "network_name", "country", "city"]);
export function registrationProgress(column, limit = 500) {
  if (!REGISTRATION_DIMENSIONS.has(column)) throw new Error(`Unsupported registration dimension: ${column}`);
  const qualified = `ri.${column}`;
  if (column === "event_type") {
    const rows = db.prepare(
      `SELECT ri.event_type AS key,
              COALESCE(SUM(ri.planned_count), 0) AS planned,
              COUNT(ri.id) AS items,
              COUNT(c.id) AS held,
              COALESCE(SUM(ri.expected_attendance), 0) AS expected_attendance
       FROM registration_items ri
       LEFT JOIN crusades c ON c.registration_item_id = ri.id
       WHERE (ri.program = 'public' OR ri.program IS NULL) AND ri.event_type <> 'rabah'
       GROUP BY ri.event_type
       UNION ALL
       SELECT 'cellular' AS key,
              COALESCE(SUM(ri.planned_count), 0) AS planned,
              COUNT(ri.id) AS items,
              COUNT(c.id) AS held,
              COALESCE(SUM(ri.expected_attendance), 0) AS expected_attendance
       FROM registration_items ri
       LEFT JOIN crusades c ON c.registration_item_id = ri.id
       WHERE (ri.program = 'public' OR ri.program IS NULL)
         AND (ri.organization_type = 'cell' OR ri.event_type = 'rabah')
       HAVING COUNT(ri.id) > 0
       ORDER BY planned DESC, key COLLATE NOCASE`
    ).all();
    return isOrganizationReportCreditEnabled() ? applyReportCredit(rows, column) : rows;
  }
  const rows = db.prepare(
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
     ORDER BY planned DESC, key COLLATE NOCASE LIMIT ?`
  ).all(limit);
  return isOrganizationReportCreditEnabled() ? applyReportCredit(rows, column) : rows;
}

const eligibleReportFilter = `(c.registration_item_id IS NULL OR linked.program = 'public' OR linked.program IS NULL)`;

const organizationIdentity = (alias) => `CASE ${alias}.organization_type
  WHEN 'network' THEN lower(trim(coalesce(${alias}.network_name, '')))
  WHEN 'cell' THEN lower(trim(coalesce(${alias}.zone, ''))) || '|' || lower(trim(coalesce(${alias}.group_name, ''))) || '|' || lower(trim(coalesce(${alias}.church_name, ''))) || '|' || lower(trim(coalesce(${alias}.cell_name, '')))
  WHEN 'church' THEN lower(trim(coalesce(${alias}.zone, ''))) || '|' || lower(trim(coalesce(${alias}.group_name, ''))) || '|' || lower(trim(coalesce(${alias}.church_name, '')))
  WHEN 'group' THEN lower(trim(coalesce(${alias}.zone, ''))) || '|' || lower(trim(coalesce(${alias}.group_name, '')))
  ELSE lower(trim(coalesce(${alias}.zone, ''))) END`;

function heldMap(rows) {
  return new Map(rows.map((row) => [String(row.key || "").trim().toLowerCase(), Number(row.held || 0)]));
}

function creditedHeldByEventType() {
  const typeRows = db.prepare(`
    WITH planned_orgs AS (
      SELECT ri.organization_type, ${organizationIdentity("ri")} AS org_key, ri.event_type AS dim_key,
             SUM(ri.planned_count) AS planned
      FROM registration_items ri
      WHERE (ri.program = 'public' OR ri.program IS NULL) AND ri.event_type <> 'rabah'
      GROUP BY ri.organization_type, org_key, ri.event_type
    ), reported_orgs AS (
      SELECT c.organization_type, ${organizationIdentity("c")} AS org_key, c.event_type AS dim_key, COUNT(*) AS reported
      FROM crusades c LEFT JOIN registration_items linked ON linked.id = c.registration_item_id
      WHERE ${eligibleReportFilter} AND c.event_type <> 'rabah'
      GROUP BY c.organization_type, org_key, c.event_type
    )
    SELECT p.dim_key AS key, SUM(MIN(p.planned, COALESCE(r.reported, 0))) AS held
    FROM planned_orgs p
    LEFT JOIN reported_orgs r
      ON r.organization_type = p.organization_type AND r.org_key = p.org_key AND r.dim_key = p.dim_key
    GROUP BY p.dim_key
  `).all();
  const cellular = db.prepare(`
    WITH planned_orgs AS (
      SELECT ri.organization_type, ${organizationIdentity("ri")} AS org_key, SUM(ri.planned_count) AS planned
      FROM registration_items ri
      WHERE (ri.program = 'public' OR ri.program IS NULL)
        AND (ri.organization_type = 'cell' OR ri.event_type = 'rabah')
      GROUP BY ri.organization_type, org_key
    ), reported_orgs AS (
      SELECT c.organization_type, ${organizationIdentity("c")} AS org_key, COUNT(*) AS reported
      FROM crusades c LEFT JOIN registration_items linked ON linked.id = c.registration_item_id
      WHERE ${eligibleReportFilter} AND (c.organization_type = 'cell' OR c.event_type = 'rabah')
      GROUP BY c.organization_type, org_key
    )
    SELECT 'cellular' AS key, COALESCE(SUM(MIN(p.planned, COALESCE(r.reported, 0))), 0) AS held
    FROM planned_orgs p
    LEFT JOIN reported_orgs r
      ON r.organization_type = p.organization_type AND r.org_key = p.org_key
  `).get();
  return heldMap([...typeRows, cellular]);
}

function creditedHeldBy(column) {
  if (column === "event_type") return creditedHeldByEventType();
  const dim = (alias) => `${alias}.${column}`;
  const rows = db.prepare(`
    WITH planned_orgs AS (
      SELECT ri.organization_type, ${organizationIdentity("ri")} AS org_key, ${dim("ri")} AS dim_key,
             SUM(ri.planned_count) AS planned
      FROM registration_items ri
      WHERE (ri.program = 'public' OR ri.program IS NULL)
        AND ${dim("ri")} IS NOT NULL AND TRIM(${dim("ri")}) <> ''
      GROUP BY ri.organization_type, org_key, LOWER(TRIM(${dim("ri")}))
    ), reported_orgs AS (
      SELECT c.organization_type, ${organizationIdentity("c")} AS org_key, ${dim("c")} AS dim_key, COUNT(*) AS reported
      FROM crusades c LEFT JOIN registration_items linked ON linked.id = c.registration_item_id
      WHERE ${eligibleReportFilter}
        AND ${dim("c")} IS NOT NULL AND TRIM(${dim("c")}) <> ''
      GROUP BY c.organization_type, org_key, LOWER(TRIM(${dim("c")}))
    )
    SELECT p.dim_key AS key, SUM(MIN(p.planned, COALESCE(r.reported, 0))) AS held
    FROM planned_orgs p
    LEFT JOIN reported_orgs r
      ON r.organization_type = p.organization_type AND r.org_key = p.org_key
     AND LOWER(TRIM(r.dim_key)) = LOWER(TRIM(p.dim_key))
    GROUP BY LOWER(TRIM(p.dim_key))
  `).all();
  return heldMap(rows);
}

function applyReportCredit(rows, column) {
  const held = creditedHeldBy(column);
  return rows.map((row) => ({
    ...row,
    held: held.get(String(row.key || "").trim().toLowerCase()) || 0,
  }));
}

export function registrationSummary() {
  if (!isOrganizationReportCreditEnabled()) {
    return db.prepare(
      `SELECT COALESCE(SUM(ri.planned_count), 0) AS total,
              COUNT(ri.id) AS items,
              COALESCE(SUM(ri.expected_attendance), 0) AS expected_attendance,
              COUNT(c.id) AS reported,
              MAX(COALESCE(SUM(ri.planned_count), 0) - COUNT(c.id), 0) AS awaiting,
              COALESCE(SUM(CASE WHEN ri.readiness_status = 'ready' THEN ri.planned_count ELSE 0 END), 0) AS ready
       FROM registration_items ri
       LEFT JOIN crusades c ON c.registration_item_id = ri.id
       WHERE (ri.program = 'public' OR ri.program IS NULL)`
    ).get();
  }
  return db.prepare(`
    WITH planned_orgs AS (
      SELECT ri.organization_type, ${organizationIdentity("ri")} AS org_key,
             SUM(ri.planned_count) AS planned
      FROM registration_items ri
      WHERE (ri.program = 'public' OR ri.program IS NULL)
      GROUP BY ri.organization_type, org_key
    ), reported_orgs AS (
      SELECT c.organization_type, ${organizationIdentity("c")} AS org_key, COUNT(*) AS reported
      FROM crusades c LEFT JOIN registration_items linked ON linked.id = c.registration_item_id
      WHERE ${eligibleReportFilter}
      GROUP BY c.organization_type, org_key
    ), credited AS (
      SELECT p.planned, MIN(p.planned, COALESCE(r.reported, 0)) AS reported
      FROM planned_orgs p LEFT JOIN reported_orgs r
        ON r.organization_type = p.organization_type AND r.org_key = p.org_key
    )
    SELECT COALESCE(SUM(ri.planned_count), 0) AS total,
           COUNT(ri.id) AS items,
           COALESCE(SUM(ri.expected_attendance), 0) AS expected_attendance,
           COALESCE((SELECT SUM(reported) FROM credited), 0) AS reported,
           MAX(COALESCE(SUM(ri.planned_count), 0) - COALESCE((SELECT SUM(reported) FROM credited), 0), 0) AS awaiting,
           COALESCE(SUM(CASE WHEN ri.readiness_status = 'ready' THEN ri.planned_count ELSE 0 END), 0) AS ready
    FROM registration_items ri WHERE (ri.program = 'public' OR ri.program IS NULL)
  `).get();
}

export function buildReportDashboardData() {
  const totals = db.prepare(`SELECT COUNT(*) AS crusades, SUM(attendance) AS attendance, ${SUMS} FROM crusades`).get();

  // attendance = onsite; online_attendance = online_participation. Bars rank by combined reach.
  const by = (col, where = "", limit = 500) =>
    db.prepare(
      `SELECT ${col} AS key, COUNT(*) AS crusades, SUM(attendance) AS attendance,
              SUM(online_participation) AS online_attendance, SUM(salvation) AS salvation
       FROM crusades ${where} GROUP BY ${col} ORDER BY (SUM(attendance) + SUM(online_participation)) DESC LIMIT ?`
    ).all(limit);

  const byCountry = by("country");
  const byCountryNormalized = [...byCountry]
    .map((row) => ({ ...row, key: resolveCountryName(row.key) || row.key }))
    .sort((a, b) => Number(b.attendance || 0) + Number(b.online_attendance || 0) - (Number(a.attendance || 0) + Number(a.online_attendance || 0)));
  const canonicalCountryCount = new Set(
    byCountry.map((row) => resolveCountryName(row.key)).filter(Boolean)
  ).size;

  return applyMyStreamSpaceAdjustment({
    totals: { ...totals, countries: canonicalCountryCount },
    by_format: by("format"),
    reports: db.prepare("SELECT COUNT(*) AS n FROM reports").get().n,
    by_category: by("event_type"),
    by_org_type: by("organization_type"),
    by_zone: by("zone", "WHERE zone IS NOT NULL"),
    by_group: by("group_name", "WHERE group_name IS NOT NULL", 100),
    by_church: by("church_name", "WHERE church_name IS NOT NULL", 100),
    by_cell: by("cell_name", "WHERE cell_name IS NOT NULL", 500),
    // Same aggregation shape as every other by_* dimension: actual held
    // crusades from the fact table. Planned-by-network lives on the
    // registrations dashboard (registered.by_network / registrations routes).
    by_network: by("network_name", "WHERE network_name IS NOT NULL AND TRIM(network_name) <> ''"),
    by_country: byCountryNormalized,
    by_city: by("city", "", 1_000),
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
    rhapsody_end_time: rhapsodyEndTimeSummary(),
    // Planned vs held is registration-linked by default, or organisation-credited
    // when that setting is on. Blue Elite rows stay out of these progress numbers.
    registered: {
      ...registrationSummary(),
      organization_report_credit_enabled: isOrganizationReportCreditEnabled(),
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
  }, getManualMyStreamSpaceAdjustment());
}

// GET /api/stats -> a persisted dashboard snapshot. Expensive aggregation is
// refreshed in a worker so opening this page never blocks the HTTP event loop.
stats.get("/", requirePageAccess("dashboard"), wrap(async (_req, res) => {
  const data = await reportDashboardData(buildReportDashboardData);
  // Revalidate in the browser on every visit; the persisted snapshot keeps the
  // response fast while a worker refreshes changed or five-minute-old figures.
  res.setHeader("Cache-Control", "private, no-cache");
  res.json(data);
}));
