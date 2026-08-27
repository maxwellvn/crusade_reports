import { Router } from "express";
import { db } from "../db.js";
import { blueEliteRegistrationSchema } from "../validation.js";
import { wrap, ApiError, logger } from "../logger.js";
import { requirePageAccess } from "../auth.js";
import { backfillCityCoords } from "./places.js";
import { sendStreamingExport } from "./exporter.js";
import { backupDatabaseRolling } from "./registrations.js";
import { typeLabel, READINESS_LABELS, ORG_TYPE_LABELS, yesNo, phone } from "../labels.js";
import { resolveCountryName } from "./countries.js";
import { cachedDashboardData } from "../dashboardCache.js";

export const blueElite = Router();

const PROGRAM = "blue_elite";
const BLUE_ELITE_CRUSADE_DATE = "2026-08-28";

// Insert path for Blue Elite registrations. Mirrors the public registration
// insert but pins program='blue_elite' on every row and stores the department
// on the parent registration. Per-crusade fields are identical to the public
// form (the network planning fields are accepted but always empty here — the
// Blue Elite form does not render them).
const insertRegStmt = db.prepare(`
  INSERT INTO registrations (program, department, organization_type, zone, group_name, church_name, cell_name, network_name, country, plan_date,
    contact_name, contact_email, phone_country_code, phone_number, kingschat_username)
  VALUES (@program, @department, @organization_type, @zone, @group_name, @church_name, @cell_name, @network_name, @country, @plan_date,
    @contact_name, @contact_email, @phone_country_code, @phone_number, @kingschat_username)
`);
const ITEM_COLS = ["registration_id", "program", "organization_type", "zone", "group_name", "church_name", "cell_name", "network_name", "country", "plan_date",
  "event_type", "other_event_type", "planned_count", "event_name", "event_date", "venue", "expected_attendance", "minister_name", "city", "city_place_id",
  "crusade_collaborators", "zone_contribution", "estimated_budget", "rhapsody_copies_confirmed", "permits_obtained", "media_coverage_plan",
  "readiness_status"];

const joinList = (value) => Array.isArray(value) && value.length ? value.map((v) => String(v).trim()).filter(Boolean).join(", ") || null : null;
const orNull = (value) => { const s = String(value ?? "").trim(); return s || null; };
const insertItemStmt = db.prepare(
  `INSERT INTO registration_items (${ITEM_COLS.join(", ")}) VALUES (${ITEM_COLS.map((c) => "@" + c).join(", ")})`
);

const insertBlueEliteRegistration = db.transaction((d) => {
  const planDate = d.items.map((item) => item.event_date).sort()[0];
  const base = {
    program: PROGRAM,
    department: d.department,
    organization_type: d.organization_type,
    zone: d.zone,
    group_name: d.group_name,
    church_name: d.church_name,
    cell_name: d.cell_name || null,
    network_name: d.network_name || null,
    country: resolveCountryName(d.items[0].country) || d.items[0].country,
    plan_date: planDate,
    contact_name: d.contact_name,
    contact_email: d.contact_email,
    phone_country_code: d.phone_country_code,
    phone_number: d.phone_number,
    kingschat_username: d.kingschat_username,
  };
  const regId = insertRegStmt.run(base).lastInsertRowid;
  for (const it of d.items) {
    insertItemStmt.run({
      ...base,
      registration_id: regId,
      country: resolveCountryName(it.country) || it.country,
      event_type: it.event_type,
      other_event_type: it.other_event_type || null,
      planned_count: 1,
      event_name: it.event_name,
      event_date: it.event_date,
      venue: it.venue,
      expected_attendance: it.expected_attendance,
      minister_name: it.minister_name || null,
      city: it.city || null,
      city_place_id: it.city_place_id || null,
      crusade_collaborators: joinList(it.crusade_collaborators),
      zone_contribution: joinList(it.zone_contribution),
      estimated_budget: orNull(it.estimated_budget),
      rhapsody_copies_confirmed: orNull(it.rhapsody_copies_confirmed),
      permits_obtained: orNull(it.permits_obtained),
      media_coverage_plan: orNull(it.media_coverage_plan),
      readiness_status: "confirmed",
    });
  }
  return regId;
});

// Public submission — no auth gate, self-declared Blue Elite staff (matches the
// existing /crusade-registration pattern).
blueElite.post("/registrations", wrap((req, res) => {
  const payload = {
    ...req.body,
    items: Array.isArray(req.body?.items)
      ? req.body.items.map((item) => ({ ...item, event_date: BLUE_ELITE_CRUSADE_DATE }))
      : req.body?.items,
  };
  const parsed = blueEliteRegistrationSchema.safeParse(payload);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid data");
  const id = insertBlueEliteRegistration(parsed.data);
  backfillCityCoords().catch(() => {});
  backupDatabaseRolling().catch((error) => logger.error({ err: error }, "blue-elite registration backup failed"));
  res.status(201).json({ id });
}));

const ORG_LABEL = "COALESCE(r.cell_name, r.church_name, r.group_name, r.network_name, r.zone, r.organization_type)";

// GET /api/blue-elite/registrations/live — totals + breakdowns for the
// permission-scoped dashboard. Scoped to program='blue_elite' so it never
// touches public registration data.
blueElite.get("/registrations/live", requirePageAccess("dashboard/blue-elite"), wrap((_req, res) => {
  const totals = db.prepare(`
    SELECT (SELECT COUNT(*) FROM registrations WHERE program = ?) AS registrations,
           COALESCE(SUM(i.planned_count), 0)      AS planned,
           COUNT(i.id)                            AS items,
           COUNT(DISTINCT i.country)              AS countries,
           COUNT(DISTINCT i.zone)                 AS zones,
           COUNT(DISTINCT i.group_name)           AS groups,
           COUNT(DISTINCT i.church_name)          AS churches,
           COUNT(DISTINCT r.department)           AS departments,
           COUNT(DISTINCT i.city)                 AS cities,
           COUNT(DISTINCT i.event_type)           AS types,
           COALESCE(SUM(i.expected_attendance), 0) AS expected_attendance,
           SUM(CASE WHEN i.readiness_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
           SUM(CASE WHEN i.readiness_status = 'not_holding' THEN 1 ELSE 0 END) AS not_holding,
           (SELECT COUNT(*) FROM crusades c JOIN registration_items ri ON c.registration_item_id = ri.id WHERE ri.program = ?) AS reported,
           COALESCE(SUM(i.planned_count), 0) - (SELECT COUNT(*) FROM crusades c JOIN registration_items ri ON c.registration_item_id = ri.id WHERE ri.program = ?) AS awaiting
    FROM registration_items i
    LEFT JOIN registrations r ON r.id = i.registration_id
    WHERE i.program = ?
  `).get(PROGRAM, PROGRAM, PROGRAM, PROGRAM);

  const byCountryRaw = db.prepare(
    `SELECT country AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
     FROM registration_items WHERE program = ? GROUP BY country ORDER BY planned DESC`).all(PROGRAM);
  const byCountry = byCountryRaw
    .map((row) => ({ ...row, key: resolveCountryName(row.key) || row.key }))
    .sort((a, b) => b.planned - a.planned || a.key.localeCompare(b.key));
  const canonicalCountryCount = new Set(
    byCountryRaw.map((row) => resolveCountryName(row.key)).filter(Boolean)
  ).size;

  res.json({
    totals: { ...totals, countries: canonicalCountryCount },
    by_type: db.prepare(
      `SELECT event_type AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE program = ? GROUP BY event_type ORDER BY planned DESC`).all(PROGRAM),
    by_country: byCountry,
    by_zone: db.prepare(
      `SELECT zone AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE program = ? AND zone IS NOT NULL GROUP BY zone ORDER BY planned DESC`).all(PROGRAM),
    by_group: db.prepare(
      `SELECT group_name AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE program = ? AND group_name IS NOT NULL GROUP BY group_name ORDER BY planned DESC`).all(PROGRAM),
    by_church: db.prepare(
      `SELECT church_name AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE program = ? AND church_name IS NOT NULL GROUP BY church_name ORDER BY planned DESC`).all(PROGRAM),
    by_department: db.prepare(
      `SELECT department AS key, COUNT(DISTINCT r.id) AS registrations, COUNT(i.id) AS items,
              COALESCE(SUM(i.planned_count), 0) AS planned, COALESCE(SUM(i.expected_attendance), 0) AS expected_attendance
       FROM registrations r LEFT JOIN registration_items i ON i.registration_id = r.id
       WHERE r.program = ? AND r.department IS NOT NULL
       GROUP BY r.department ORDER BY planned DESC`).all(PROGRAM),
    by_city: db.prepare(
      `SELECT city AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE program = ? AND city IS NOT NULL GROUP BY city ORDER BY planned DESC`).all(PROGRAM),
    by_readiness: db.prepare(
      `SELECT readiness_status AS key, COUNT(*) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE program = ? GROUP BY readiness_status ORDER BY planned DESC`).all(PROGRAM),
    geo: db.prepare(
      `SELECT city AS key, country, MAX(city_lat) AS lat, MAX(city_lng) AS lng, SUM(planned_count) AS planned
       FROM registration_items WHERE program = ? AND city_lat IS NOT NULL GROUP BY city, country`).all(PROGRAM),
    recent: db.prepare(
      `SELECT r.id, r.created_at, r.department, r.organization_type, r.zone, r.group_name, r.church_name, r.country, r.plan_date,
              ${ORG_LABEL} AS org,
              COALESCE(SUM(i.planned_count), 0) AS planned, COUNT(i.id) AS types
       FROM registrations r LEFT JOIN registration_items i ON i.registration_id = r.id
       WHERE r.program = ?
       GROUP BY r.id ORDER BY r.created_at DESC, r.id DESC LIMIT 25`).all(PROGRAM),
  });
}));

// Filters shared by the table and the export — scoped to program='blue_elite'.
function blueEliteFilters(query) {
  const where = ["r.program = @program"];
  const params = { program: PROGRAM };
  for (const col of ["zone", "group_name", "church_name", "department"]) {
    if (query[col]) { where.push(`r.${col} = @${col}`); params[col] = String(query[col]); }
  }
  if (query.country) { where.push("i.country = @country"); params.country = String(query.country); }
  if (query.city) { where.push("i.city = @city"); params.city = String(query.city); }
  if (query.readiness_status) { where.push("i.readiness_status = @readiness_status"); params.readiness_status = String(query.readiness_status); }
  if (query.report_status === "reported") where.push("EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id)");
  if (query.report_status === "unreported") where.push("NOT EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id)");
  if (query.event_type) { where.push("i.event_type = @event_type"); params.event_type = String(query.event_type); }
  if (query.date_from) { where.push("i.event_date >= @date_from"); params.date_from = String(query.date_from); }
  if (query.date_to) { where.push("i.event_date <= @date_to"); params.date_to = String(query.date_to); }
  const minAttendance = parseInt(query.min_attendance, 10);
  if (Number.isFinite(minAttendance) && minAttendance > 0) {
    where.push("i.expected_attendance >= @min_attendance"); params.min_attendance = minAttendance;
  }
  String(query.q || "").trim().split(/\s+/).filter(Boolean).slice(0, 8).forEach((tok, n) => {
    const p = `q${n}`;
    where.push(`(r.zone LIKE @${p} OR r.group_name LIKE @${p} OR r.church_name LIKE @${p} OR r.department LIKE @${p} OR r.country LIKE @${p}
      OR r.contact_name LIKE @${p} OR r.contact_email LIKE @${p} OR r.phone_country_code || r.phone_number LIKE @${p}
      OR r.kingschat_username LIKE @${p}
      OR i.country LIKE @${p} OR i.city LIKE @${p} OR i.event_type LIKE @${p} OR i.event_name LIKE @${p} OR i.venue LIKE @${p}
      OR i.readiness_status LIKE @${p} OR i.readiness_notes LIKE @${p})`);
    params[p] = `%${tok}%`;
  });
  return { clause: `WHERE ${where.join(" AND ")}`, params };
}

const EXPORT_SELECT =
  `SELECT i.event_type, i.event_name, i.event_date, i.venue, i.expected_attendance, i.minister_name, i.country, i.city,
          i.readiness_status, i.readiness_notes,
          r.created_at AS registered_at, r.department, r.organization_type, r.zone, r.group_name, r.church_name,
          r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username,
          EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id) AS report_submitted
   FROM registration_items i JOIN registrations r ON r.id = i.registration_id`;

const EXPORT_COLUMNS = [
  { header: "Registered on", value: (row) => (row.registered_at || "").slice(0, 10) },
  { header: "Crusade date", value: (row) => row.event_date },
  { header: "Crusade name", value: (row) => row.event_name },
  { header: "Type", value: (row) => typeLabel(row.event_type) },
  { header: "Country", value: (row) => row.country },
  { header: "City", value: (row) => row.city },
  { header: "Venue / address", value: (row) => row.venue },
  { header: "Expected attendance", value: (row) => row.expected_attendance },
  { header: "Ministers", value: (row) => row.minister_name },
  { header: "Readiness", value: (row) => READINESS_LABELS[row.readiness_status] || row.readiness_status },
  { header: "Readiness notes", value: (row) => row.readiness_notes },
  { header: "Report submitted", value: (row) => yesNo(row.report_submitted) },
  { header: "Department", value: (row) => row.department },
  { header: "Registered as", value: (row) => ORG_TYPE_LABELS[row.organization_type] || row.organization_type },
  { header: "Zone", value: (row) => row.zone },
  { header: "Group", value: (row) => row.group_name },
  { header: "Church", value: (row) => row.church_name },
  { header: "Staff name", value: (row) => row.contact_name },
  { header: "Email", value: (row) => row.contact_email },
  { header: "Phone", value: (row) => phone(row.phone_country_code, row.phone_number) },
  { header: "KingsChat", value: (row) => row.kingschat_username },
];

blueElite.get("/registrations/export", requirePageAccess("registrations/blue-elite"), wrap(async (req, res) => {
  const { clause, params } = blueEliteFilters(req.query);
  const rows = db.prepare(`${EXPORT_SELECT} ${clause} ORDER BY i.id DESC`).iterate(params);
  await sendStreamingExport(res, req.query.format === "xlsx" ? "xlsx" : "csv", "blue-elite-registered-crusades", EXPORT_COLUMNS, rows);
}));

// GET /api/blue-elite/registrations — paginated, filtered, sorted table.
blueElite.get("/registrations", requirePageAccess("registrations/blue-elite"), wrap((req, res) => {
  const { clause, params } = blueEliteFilters(req.query);
  const pageSize = Math.min(Math.max(parseInt(req.query.page_size, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const SORT = {
    created_at: "i.id", event_date: "i.event_date", event_name: "i.event_name COLLATE NOCASE",
    event_type: "i.event_type COLLATE NOCASE", expected_attendance: "i.expected_attendance",
    zone: "r.zone COLLATE NOCASE", country: "r.country COLLATE NOCASE", org: "org COLLATE NOCASE",
  };
  const sortCol = req.query.sort ? (SORT[req.query.sort] || "i.id") : "i.id";
  const dir = req.query.dir === "asc" ? "ASC" : "DESC";

  const countKey = `blue-elite-registrations-count:${JSON.stringify(params)}:${clause}`;
  const total = cachedDashboardData(countKey,
    () => db.prepare(`SELECT COUNT(*) AS n FROM registration_items i JOIN registrations r ON r.id = i.registration_id ${clause}`).get(params).n,
    60_000);
  const rows = db.prepare(
    `SELECT i.id, i.registration_id, i.event_type, i.planned_count, i.event_name, i.event_date, i.venue,
            i.expected_attendance, i.minister_name, i.city, i.city_place_id, i.readiness_status, i.readiness_notes, i.readiness_updated_at,
            r.created_at AS registered_at, r.department, r.organization_type, r.zone, r.group_name, r.church_name,
            r.country, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number,
            r.kingschat_username, ${ORG_LABEL} AS org,
            EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id) AS report_submitted,
            (SELECT c.id FROM crusades c WHERE c.registration_item_id = i.id LIMIT 1) AS report_crusade_id
     FROM registration_items i JOIN registrations r ON r.id = i.registration_id
     ${clause} ORDER BY ${sortCol} ${dir}, i.id DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  res.json({ rows, total, page, page_size: pageSize });
}));
