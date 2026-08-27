import { Router } from "express";
import { db } from "../db.js";
import { backupDatabase } from "../databaseProtection.js";
import { registrationCrusadeEditSchema, registrationSchema, manualOrgUpdateSchema } from "../validation.js";
import { wrap, ApiError, logger } from "../logger.js";
import { requirePageAccess, requireSuperAdmin, requireExternalOrPageAccess } from "../auth.js";
import { backfillCityCoords } from "./places.js";
import { applyPortalScope } from "../portalScope.js";
import { ensureReportingOpen, isManualGroupsEnabled, isManualZonesEnabled } from "../appSettings.js";
import { submitRegisteredCrusadeReport } from "./reports.js";
import { parseReportPayload, removeUploadedFiles, withReportPhotoUpload } from "../reportMedia.js";
import { sendExport, sendStreamingExport } from "./exporter.js";
import { registrationImporter } from "./registrationImporter.js";
import { typeLabel, READINESS_LABELS, ORG_TYPE_LABELS, yesNo, phone } from "../labels.js";
import { COUNTRIES, resolveCountryName } from "./countries.js";
import { CRUSADE_TYPES } from "../../client/src/lib/constants.js";
import { loadZones } from "./zones.js";
import { cachedDashboardData } from "../dashboardCache.js";
import { registrationDashboardData, scheduleRegistrationDashboardRefresh } from "../registrationDashboardSnapshot.js";

export const registrations = Router();

export const backupDatabaseRolling = () => backupDatabase("registration");

const sameName = (left, right) => String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();

// The server, not the client-supplied *_manual flags, decides whether an
// organization is canonical. This prevents forged requests and restored drafts
// from bypassing the campaign settings.
export function validateRegistrationOrganization(data, directory, {
  manualZonesEnabled = false,
  manualGroupsEnabled = false,
  trustedZone = false,
} = {}) {
  const organization = { ...data, zone_manual: false, group_manual: false };
  if (organization.organization_type === "network") {
    return { ...organization, zone: "", group_name: "" };
  }

  const submittedZone = String(organization.zone || "").trim();
  const canonicalZone = (directory || []).find((entry) => sameName(entry.zone, submittedZone));
  if (canonicalZone) {
    organization.zone = canonicalZone.zone;
  } else if (trustedZone) {
    organization.zone = submittedZone;
  } else if (manualZonesEnabled) {
    organization.zone = submittedZone;
    organization.zone_manual = true;
  } else {
    throw new ApiError(422, "INVALID_ZONE", "Choose an official zone from the directory.");
  }

  if (organization.organization_type === "zone") {
    return { ...organization, group_name: "", group_manual: false };
  }

  const submittedGroup = String(organization.group_name || "").trim();
  const canonicalGroup = canonicalZone?.groups?.find((group) => sameName(group.name, submittedGroup));
  if (canonicalGroup) {
    organization.group_name = canonicalGroup.name;
  } else if (canonicalZone && (directory || []).some((entry) =>
    entry !== canonicalZone && entry.groups?.some((group) => sameName(group.name, submittedGroup)))) {
    throw new ApiError(422, "GROUP_ZONE_MISMATCH", "Choose a group that belongs to the selected zone.");
  } else if (manualGroupsEnabled) {
    organization.group_name = submittedGroup;
    organization.group_manual = true;
  } else {
    throw new ApiError(422, "INVALID_GROUP", "Choose an official group from the directory.");
  }
  return organization;
}

export function deleteRegistrationCrusade(id) {
  const item = db.prepare(`
    SELECT i.id, i.registration_id,
           EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id) AS report_submitted
    FROM registration_items i WHERE i.id = ?
  `).get(id);
  if (!item) throw new ApiError(404, "NOT_FOUND", "Registered crusade not found.");
  if (item.report_submitted) {
    throw new ApiError(409, "REPORT_EXISTS", "Delete this crusade's report before deleting its registration.");
  }

  return db.transaction(() => {
    db.prepare("DELETE FROM registration_items WHERE id = ?").run(item.id);
    const registrationDeleted = !db.prepare("SELECT 1 FROM registration_items WHERE registration_id = ?").get(item.registration_id);
    if (registrationDeleted) {
      db.prepare("DELETE FROM registrations WHERE id = ?").run(item.registration_id);
    } else {
      db.prepare(`UPDATE registrations SET plan_date =
        (SELECT MIN(event_date) FROM registration_items WHERE registration_id = ?) WHERE id = ?`
      ).run(item.registration_id, item.registration_id);
    }
    return { id: item.id, registration_id: item.registration_id, registration_deleted: registrationDeleted };
  })();
}

const insertRegStmt = db.prepare(`
  INSERT INTO registrations (organization_type, zone, group_name, zone_manual, group_manual, church_name, cell_name, network_name, country, plan_date,
    contact_name, contact_email, phone_country_code, phone_number, kingschat_username)
  VALUES (@organization_type, @zone, @group_name, @zone_manual, @group_manual, @church_name, @cell_name, @network_name, @country, @plan_date,
    @contact_name, @contact_email, @phone_country_code, @phone_number, @kingschat_username)
`);
const ITEM_COLS = ["registration_id", "organization_type", "zone", "group_name", "zone_manual", "group_manual", "church_name", "cell_name", "network_name", "country", "plan_date",
  "event_type", "other_event_type", "planned_count", "event_name", "event_date", "venue", "expected_attendance", "minister_name", "city", "city_place_id",
  "crusade_collaborators", "zone_contribution", "estimated_budget", "rhapsody_copies_confirmed", "permits_obtained", "media_coverage_plan",
  "readiness_status"];

// Multi-select network fields arrive as arrays; store one comma-joined string per
// crusade (null when empty) so dashboards can render and search them directly.
const joinList = (value) => Array.isArray(value) && value.length ? value.map((v) => String(v).trim()).filter(Boolean).join(", ") || null : null;
const orNull = (value) => { const s = String(value ?? "").trim(); return s || null; };
const insertItemStmt = db.prepare(
  `INSERT INTO registration_items (${ITEM_COLS.join(", ")}) VALUES (${ITEM_COLS.map((c) => "@" + c).join(", ")})`
);

export const insertRegistration = db.transaction((d) => {
  const planDate = d.items.map((item) => item.event_date).sort()[0];
  const base = {
    organization_type: d.organization_type,
    zone: d.zone || null,
    group_name: d.group_name || null,
    zone_manual: d.zone_manual ? 1 : 0,
    group_manual: d.group_manual ? 1 : 0,
    church_name: d.church_name || null,
    cell_name: d.cell_name || null,
    network_name: d.network_name || null,
    // Country is per crusade now; the registration row keeps the first crusade's
    // country as its primary (the column is NOT NULL and drives registration-level grouping).
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
      zone_manual: d.zone_manual ? 1 : 0,
      group_manual: d.group_manual ? 1 : 0,
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
      // Logging a crusade confirms it by default; the coordinator can still edit
      // the readiness afterwards (preparing, ready, not holding, …).
      readiness_status: "confirmed",
    });
  }
  return regId;
});

registrations.post("/", wrap(async (req, res) => {
  const portalToken = String(req.body?.portal_token || "");
  const payload = applyPortalScope(req.body, portalToken);
  const parsed = registrationSchema.safeParse(payload);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid data");
  const registration = parsed.data.organization_type === "network"
    ? validateRegistrationOrganization(parsed.data, [], {})
    : validateRegistrationOrganization(parsed.data, portalToken ? [] : await loadZones(), {
      manualZonesEnabled: isManualZonesEnabled(),
      manualGroupsEnabled: isManualGroupsEnabled(),
      trustedZone: Boolean(portalToken),
    });
  const id = insertRegistration(registration);
  scheduleRegistrationDashboardRefresh({ force: true });
  backfillCityCoords().catch(() => {});
  backupDatabaseRolling().catch((error) => logger.error({ err: error }, "registration backup failed"));
  res.status(201).json({ id });
}));

// Bulk registration upload (xlsx). Public — mirrors the report importer: parse,
// validate, geocode, return rows to the client for review. No DB commit here.
registrations.use("/import", registrationImporter);

// Directory gaps are intentionally visible to admins for reconciliation. These
// rows remain ordinary registrations; the flags only identify names typed by a
// registrant instead of selected from the directory.
registrations.get("/manual-organizations", requirePageAccess("registrations/manual-organizations"), wrap((_req, res) => {
  const rows = db.prepare(`
    SELECT i.id, i.registration_id, i.created_at, i.zone, i.group_name,
           i.zone_manual, i.group_manual, i.event_name, i.event_date, i.city, i.country,
           r.organization_type, r.contact_name, r.contact_email
    FROM registration_items i
    JOIN registrations r ON r.id = i.registration_id
    WHERE (i.program = 'public' OR i.program IS NULL)
      AND (i.zone_manual = 1 OR i.group_manual = 1)
    ORDER BY i.created_at DESC, i.id DESC
  `).all();
  res.json({ rows });
}));

// Admin reconciliation: map a manually-typed zone/group to the real directory
// entry. Updates both the registrations row and all its registration_items so
// the flags stay consistent. Access requires the explicit manual-organisations permission.
registrations.patch("/manual-organizations/:registrationId", requirePageAccess("registrations/manual-organizations"), wrap((req, res) => {
  const parsed = manualOrgUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid organisation update.");
  const { zone, group_name } = parsed.data;
  const regId = req.params.registrationId;
  const reg = db.prepare("SELECT id FROM registrations WHERE id = ?").get(regId);
  if (!reg) throw new ApiError(404, "NOT_FOUND", "Registration not found");
  db.transaction(() => {
    db.prepare("UPDATE registrations SET zone = ?, group_name = ?, zone_manual = 0, group_manual = 0 WHERE id = ?")
      .run(zone, group_name || null, regId);
    db.prepare("UPDATE registration_items SET zone = ?, group_name = ?, zone_manual = 0, group_manual = 0 WHERE registration_id = ?")
      .run(zone, group_name || null, regId);
  })();
  scheduleRegistrationDashboardRefresh({ force: true });
  backupDatabaseRolling().catch((error) => logger.error({ err: error }, "org reconciliation backup failed"));
  res.json({ ok: true });
}));

// A crusade's network planning details (collaborators, contribution, budget,
// Rhapsody copies, permits, media plan) may only change up to its date — once the
// crusade date has passed they lock, so the pre-crusade plan can't be rewritten
// after the fact. The rest of the crusade stays editable regardless.
export function planningEditable(eventDate) {
  if (!eventDate) return true;
  return eventDate >= db.prepare("SELECT date('now') AS today").get().today;
}

export function updateRegistrationCrusade(id, d) {
  const crusade = db.prepare("SELECT id, registration_id, event_date FROM registration_items WHERE id = ?").get(id);
  if (!crusade) return null;
  const canEditPlanning = planningEditable(crusade.event_date);
  db.transaction(() => {
    const assignments = [
      "event_type = @event_type", "event_name = @event_name", "event_date = @event_date", "venue = @venue",
      "expected_attendance = @expected_attendance", "minister_name = @minister_name", "city = @city", "city_place_id = @city_place_id",
      "readiness_status = @status", "readiness_notes = @feedback", "readiness_updated_at = datetime('now')",
    ];
    const params = {
      id: crusade.id, event_type: d.event_type, event_name: d.event_name, event_date: d.event_date, venue: d.venue,
      expected_attendance: d.expected_attendance, minister_name: d.minister_name || null, city: d.city,
      city_place_id: d.city_place_id || null, status: d.status, feedback: d.feedback || null,
    };
    if (canEditPlanning) {
      assignments.push(
        "crusade_collaborators = @crusade_collaborators", "zone_contribution = @zone_contribution",
        "estimated_budget = @estimated_budget", "rhapsody_copies_confirmed = @rhapsody_copies_confirmed",
        "permits_obtained = @permits_obtained", "media_coverage_plan = @media_coverage_plan",
      );
      params.crusade_collaborators = joinList(d.crusade_collaborators);
      params.zone_contribution = joinList(d.zone_contribution);
      params.estimated_budget = orNull(d.estimated_budget);
      params.rhapsody_copies_confirmed = orNull(d.rhapsody_copies_confirmed);
      params.permits_obtained = orNull(d.permits_obtained);
      params.media_coverage_plan = orNull(d.media_coverage_plan);
    }
    db.prepare(`UPDATE registration_items SET ${assignments.join(", ")} WHERE id = @id`).run(params);
    db.prepare(`UPDATE registrations SET plan_date = (SELECT MIN(event_date) FROM registration_items WHERE registration_id = ?)
      WHERE id = ?`).run(crusade.registration_id, crusade.registration_id);
  })();
  backfillCityCoords().catch(() => {});
  return db.prepare(`SELECT id, event_type, event_name, event_date, venue, expected_attendance, minister_name, city, city_place_id,
    crusade_collaborators, zone_contribution, estimated_budget, rhapsody_copies_confirmed, permits_obtained, media_coverage_plan,
    readiness_status, readiness_notes, readiness_updated_at FROM registration_items WHERE id = ?`).get(crusade.id);
}

registrations.put("/:id", requirePageAccess("registrations"), wrap((req, res) => {
  const parsed = registrationCrusadeEditSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid crusade details.");
  const updated = updateRegistrationCrusade(req.params.id, parsed.data);
  if (!updated) throw new ApiError(404, "NOT_FOUND", "Registered crusade not found.");
  scheduleRegistrationDashboardRefresh({ force: true });
  res.json(updated);
}));

registrations.delete("/:id", requireSuperAdmin, wrap((req, res) => {
  const deleted = deleteRegistrationCrusade(req.params.id);
  scheduleRegistrationDashboardRefresh({ force: true });
  res.json(deleted);
}));

registrations.post("/:id/report", requirePageAccess("registrations"), withReportPhotoUpload(wrap((req, res) => {
  ensureReportingOpen();
  const files = req.files || [];
  const item = db.prepare(`
    SELECT i.*, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username
    FROM registration_items i JOIN registrations r ON r.id = i.registration_id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!item) {
    removeUploadedFiles(files);
    throw new ApiError(404, "NOT_FOUND", "Registered crusade not found.");
  }
  res.status(201).json(submitRegisteredCrusadeReport(item, parseReportPayload(req), files));
})));

// The org display name, dashboard-style: most specific level first.
const ORG_LABEL = "COALESCE(r.cell_name, r.church_name, r.group_name, r.network_name, r.zone, r.organization_type)";

// GET /api/registrations/live — everything the live dashboard + landing page need.
// Scoped to program='public' (or NULL for rows that pre-date the column) so the
// Blue Elite module's data never leaks into the original admin views.
const PUBLIC_PROGRAM_FILTER = "(i.program = 'public' OR i.program IS NULL)";
const CELLULAR_ITEM_FILTER = "(i.organization_type = 'cell' OR i.event_type = 'rabah')";

const REGISTRATION_FILTER_OPTION_COLS = ["zone", "group_name", "church_name", "cell_name", "network_name", "country", "city"];

// Values for the admin table dropdowns come from all public registration
// records, rather than only the currently filtered page.
export function registrationFilterOptions() {
  return cachedDashboardData("registration-filter-options", () => Object.fromEntries(REGISTRATION_FILTER_OPTION_COLS.map((column) => [
    column,
    db.prepare(
      `SELECT DISTINCT TRIM(${column}) AS value
       FROM registration_items i
       WHERE ${PUBLIC_PROGRAM_FILTER} AND ${column} IS NOT NULL AND TRIM(${column}) <> ''
       ORDER BY value COLLATE NOCASE LIMIT 500`
    ).all().map((row) => row.value),
  ])), 300_000);
}

const CELLULAR_DIMENSIONS = new Set(["zone", "group_name", "church_name"]);
export function cellularRegistrationsBy(column) {
  if (!CELLULAR_DIMENSIONS.has(column)) throw new Error(`Unsupported cellular dimension: ${column}`);
  return db.prepare(
    `SELECT ${column} AS key, COALESCE(SUM(planned_count), 0) AS planned,
            COUNT(DISTINCT registration_id) AS registrations
     FROM registration_items i
     WHERE ${PUBLIC_PROGRAM_FILTER}
       AND ${CELLULAR_ITEM_FILTER}
       AND ${column} IS NOT NULL AND TRIM(${column}) <> ''
     GROUP BY ${column} COLLATE NOCASE
     ORDER BY planned DESC, key COLLATE NOCASE`
  ).all();
}

export function registrationTypeBreakdown() {
  return db.prepare(
    `SELECT event_type AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
     FROM registration_items i
     WHERE ${PUBLIC_PROGRAM_FILTER} AND event_type <> 'rabah'
     GROUP BY event_type
     UNION ALL
     SELECT 'cellular' AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
     FROM registration_items i
     WHERE ${PUBLIC_PROGRAM_FILTER} AND ${CELLULAR_ITEM_FILTER}
     HAVING COUNT(*) > 0
     ORDER BY planned DESC`
  ).all();
}

export function cellRegistrationsByZone() {
  return db.prepare(
    `SELECT zone, group_name, church_name, cell_name AS key, COALESCE(SUM(planned_count), 0) AS planned,
            COUNT(DISTINCT registration_id) AS registrations
     FROM registration_items i
     WHERE ${PUBLIC_PROGRAM_FILTER}
       AND ${CELLULAR_ITEM_FILTER}
       AND zone IS NOT NULL AND TRIM(zone) <> ''
       AND cell_name IS NOT NULL AND TRIM(cell_name) <> ''
     GROUP BY zone COLLATE NOCASE, group_name COLLATE NOCASE, church_name COLLATE NOCASE, cell_name COLLATE NOCASE
     ORDER BY zone COLLATE NOCASE, group_name COLLATE NOCASE, planned DESC, key COLLATE NOCASE`
  ).all();
}

export function attachCellRegions(rows, directory) {
  const regionByZone = new Map(directory.map((entry) => [String(entry.zone).trim().toLowerCase(), entry.region]));
  return rows.map((row) => ({
    ...row,
    region: regionByZone.get(String(row.zone).trim().toLowerCase()) || "Region not mapped",
  }));
}

export function buildZoneCrusadeBreakdown(typeRows, cellularRows) {
  const zones = new Map();
  const ensure = (zone) => {
    if (!zones.has(zone)) zones.set(zone, { zone, total: 0, cellular: 0, types: {} });
    return zones.get(zone);
  };
  for (const row of typeRows) {
    const zone = ensure(row.zone);
    const planned = Number(row.planned) || 0;
    if (row.event_type !== "rabah") zone.types[row.event_type] = planned;
    zone.total += planned;
  }
  for (const row of cellularRows) ensure(row.zone).cellular = Number(row.planned) || 0;
  return [...zones.values()].sort((a, b) => b.total - a.total || a.zone.localeCompare(b.zone));
}

async function crusadeAnalysisData() {
  const typeRows = db.prepare(
    `SELECT zone, event_type, COALESCE(SUM(planned_count), 0) AS planned
     FROM registration_items i
     WHERE ${PUBLIC_PROGRAM_FILTER}
       AND zone IS NOT NULL AND TRIM(zone) <> ''
       AND event_type IS NOT NULL AND TRIM(event_type) <> ''
     GROUP BY zone COLLATE NOCASE, event_type
     ORDER BY zone COLLATE NOCASE, planned DESC`
  ).all();
  const cellularByZone = cellularRegistrationsBy("zone");
  const zoneTypeBreakdown = buildZoneCrusadeBreakdown(
    typeRows,
    cellularByZone.map((row) => ({ zone: row.key, planned: row.planned }))
  );
  const summary = db.prepare(
    `SELECT COALESCE(SUM(planned_count), 0) AS total,
            COALESCE(SUM(CASE WHEN event_type = 'mega' THEN planned_count ELSE 0 END), 0) AS mega,
            COALESCE(SUM(CASE WHEN event_type = 'online' THEN planned_count ELSE 0 END), 0) AS online,
            COALESCE(SUM(CASE WHEN ${CELLULAR_ITEM_FILTER} THEN planned_count ELSE 0 END), 0) AS cellular,
            COUNT(DISTINCT CASE WHEN zone IS NOT NULL AND TRIM(zone) <> '' THEN zone END) AS zones
     FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER}`
  ).get();
  return {
    summary,
    cellular: {
      by_zone: cellularByZone,
      by_group: cellularRegistrationsBy("group_name"),
      by_church: cellularRegistrationsBy("church_name"),
      by_cell: attachCellRegions(cellRegistrationsByZone(), await loadZones()),
    },
    zone_type_breakdown: zoneTypeBreakdown,
    active_types: CRUSADE_TYPES.filter(([key]) => key !== "rabah" && typeRows.some((row) => row.event_type === key)),
  };
}

registrations.get("/crusade-analysis", requirePageAccess("dashboard/crusade-analysis"), wrap(async (_req, res) => {
  res.setHeader("Cache-Control", "private, max-age=30");
  res.json(await cachedDashboardData("crusade-analysis", crusadeAnalysisData));
}));

registrations.get("/crusade-analysis/export", requirePageAccess("dashboard/crusade-analysis"), wrap(async (req, res) => {
  const data = await crusadeAnalysisData();
  const format = ["xlsx", "pdf"].includes(req.query.format) ? req.query.format : "csv";
  if (req.query.view === "cellular") {
    const level = ["group", "church"].includes(req.query.level) ? req.query.level : "zone";
    const rows = data.cellular[`by_${level}`];
    return sendExport(res, format, `cellular-crusades-by-${level}`, [
      { header: level[0].toUpperCase() + level.slice(1), value: (row) => row.key, pdfWidth: 3 },
      { header: "Registered crusades", value: (row) => row.planned, align: "right" },
      { header: "Registration entries", value: (row) => row.registrations, align: "right" },
    ], rows);
  }
  if (req.query.view === "cells") {
    return sendExport(res, format, "cellular-crusades-by-cell-and-zone", [
      { header: "Region", value: (row) => row.region, pdfWidth: 1.5 },
      { header: "Zone", value: (row) => row.zone, pdfWidth: 2.5 },
      { header: "Group", value: (row) => row.group_name || "Not specified", pdfWidth: 2 },
      { header: "Church", value: (row) => row.church_name || "Not specified", pdfWidth: 2 },
      { header: "Cell", value: (row) => row.key, pdfWidth: 2.5 },
      { header: "Registered crusades", value: (row) => row.planned, align: "right" },
      { header: "Registration entries", value: (row) => row.registrations, align: "right" },
    ], data.cellular.by_cell);
  }

  const typeColumns = [
    ["online", "Online Crusades"],
    ...(format === "pdf" ? [] : data.active_types.filter(([key]) => !["mega", "online"].includes(key))),
  ];
  await sendExport(res, format, "registered-crusade-types-by-zone", [
    { header: "Zone", value: (row) => row.zone, pdfWidth: 2.5 },
    { header: "Mega", value: (row) => row.types.mega || 0, align: "right" },
    { header: "Cellular", value: (row) => row.cellular || 0, align: "right" },
    ...typeColumns.map(([key, label]) => ({
      header: label.replace(/ Crusades.*$/, ""), value: (row) => row.types[key] || 0, align: "right",
    })),
    { header: "Total", value: (row) => row.total, align: "right" },
  ], data.zone_type_breakdown, {
    title: "Registered Crusade Types by Zone",
    subtitle: format === "pdf" ? "Mega, Cellular, Online, and total registered crusades" : undefined,
  });
}));

export function buildRegistrationLiveData() {
  const totals = db.prepare(`
    SELECT (SELECT COUNT(*) FROM registrations WHERE program = 'public' OR program IS NULL) AS registrations,
           COALESCE(SUM(planned_count), 0)      AS planned,
           COUNT(*)                             AS items,
           COUNT(DISTINCT zone)                 AS zones,
           COUNT(DISTINCT group_name)           AS groups,
           COUNT(DISTINCT church_name)          AS churches,
           COUNT(DISTINCT cell_name)            AS cells,
           COUNT(DISTINCT network_name)         AS networks,
           COUNT(DISTINCT city)                 AS cities,
           COUNT(DISTINCT event_type)           AS types,
           COALESCE(SUM(expected_attendance), 0) AS expected_attendance,
           SUM(CASE WHEN readiness_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
           SUM(CASE WHEN readiness_status = 'not_holding' THEN 1 ELSE 0 END) AS not_holding,
           SUM(CASE WHEN organization_type = 'zone' THEN planned_count ELSE 0 END)    AS zone_crusades,
           SUM(CASE WHEN organization_type = 'group' THEN planned_count ELSE 0 END)   AS group_crusades,
           SUM(CASE WHEN organization_type = 'church' THEN planned_count ELSE 0 END)  AS church_crusades,
           SUM(CASE WHEN organization_type = 'cell' THEN planned_count ELSE 0 END)    AS cell_crusades,
           SUM(CASE WHEN organization_type = 'network' THEN planned_count ELSE 0 END) AS network_crusades,
           (SELECT COUNT(*) FROM crusades c JOIN registration_items i ON c.registration_item_id = i.id WHERE ${PUBLIC_PROGRAM_FILTER}) AS reported,
           COALESCE(SUM(planned_count), 0) - (SELECT COUNT(*) FROM crusades c JOIN registration_items i ON c.registration_item_id = i.id WHERE ${PUBLIC_PROGRAM_FILTER}) AS awaiting
    FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER}
  `).get();

  const byCountryRaw = db.prepare(
    `SELECT country AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
     FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} GROUP BY country ORDER BY planned DESC`
  ).all();
  const byCountry = byCountryRaw
    .map((row) => ({ ...row, key: resolveCountryName(row.key) || row.key }))
    .sort((a, b) => b.planned - a.planned || a.key.localeCompare(b.key));
  const canonicalCountryCount = new Set(
    byCountryRaw.map((row) => resolveCountryName(row.key)).filter(Boolean)
  ).size;

  return {
    totals: {
      ...totals,
      // Unresolved legacy upload values remain visible for cleanup, but they
      // are not nations and must not inflate the canonical country KPI.
      countries: Math.min(canonicalCountryCount, COUNTRIES.length),
    },
    by_type: registrationTypeBreakdown(),
    by_country: byCountry,
    by_zone: db.prepare(
      `SELECT zone AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} AND zone IS NOT NULL GROUP BY zone ORDER BY planned DESC`
    ).all().slice(0, 100),
    by_network: db.prepare(
      `SELECT i.network_name AS key,
              SUM(i.planned_count) AS planned, COUNT(DISTINCT i.registration_id) AS registrations
       FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER}
         AND i.network_name IS NOT NULL AND TRIM(i.network_name) <> ''
       GROUP BY key ORDER BY planned DESC LIMIT 100`
    ).all(),
    by_group: db.prepare(
      `SELECT group_name AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} AND group_name IS NOT NULL GROUP BY group_name ORDER BY planned DESC LIMIT 100`
    ).all(),
    by_church: db.prepare(
      `SELECT church_name AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} AND church_name IS NOT NULL GROUP BY church_name ORDER BY planned DESC LIMIT 100`
    ).all(),
    by_cell: db.prepare(
      `SELECT cell_name AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} AND cell_name IS NOT NULL GROUP BY cell_name ORDER BY planned DESC LIMIT 500`
    ).all(),
    by_city: db.prepare(
      `SELECT city AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} AND city IS NOT NULL GROUP BY city ORDER BY planned DESC LIMIT 1000`
    ).all(),
    by_org_type: db.prepare(
      `SELECT organization_type AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} GROUP BY organization_type ORDER BY planned DESC`
    ).all(),
    by_readiness: db.prepare(
      `SELECT readiness_status AS key, COUNT(*) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} GROUP BY readiness_status ORDER BY planned DESC`
    ).all(),
    // Real city points (geocoded) for the coverage map.
    geo: db.prepare(
      `SELECT city AS key, country, MAX(city_lat) AS lat, MAX(city_lng) AS lng, SUM(planned_count) AS planned
       FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} AND city_lat IS NOT NULL
       GROUP BY city, country ORDER BY planned DESC LIMIT 1000`
    ).all(),
    // The live feed: latest registrations with their own totals.
    recent: db.prepare(
      `SELECT r.id, r.created_at, r.organization_type, r.zone, r.group_name, r.church_name, r.cell_name, r.network_name, r.country, r.plan_date,
              ${ORG_LABEL} AS org,
              COALESCE(SUM(i.planned_count), 0) AS planned, COUNT(i.id) AS types
       FROM registrations r LEFT JOIN registration_items i ON i.registration_id = r.id
       WHERE (r.program = 'public' OR r.program IS NULL)
       GROUP BY r.id ORDER BY r.created_at DESC, r.id DESC LIMIT 25`
    ).all(),
  };
}

registrations.get("/live", requirePageAccess("registrations/live"), wrap((_req, res) => {
  const data = registrationDashboardData(buildRegistrationLiveData);
  res.setHeader("Cache-Control", "private, max-age=30");
  res.json(data);
}));

// Returns all countries without any registrations.
registrations.get("/countries-without-registrations", requirePageAccess("dashboard/crusade-analysis"), wrap((_req, res) => {
  const registeredCountries = new Set(
    db.prepare(
      `SELECT DISTINCT country FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} AND country IS NOT NULL`
    ).all().map((row) => resolveCountryName(row.country)).filter(Boolean)
  );
  const missing = COUNTRIES.filter((c) => !registeredCountries.has(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  res.json({ countries: missing, total: missing.length });
}));

registrations.get("/country-report.pdf", requirePageAccess("dashboard/crusade-analysis"), wrap(async (_req, res) => {
  const continentByCountry = new Map(COUNTRIES.map((country) => [country.name.toLowerCase(), country.continent || "Other"]));
  const raw = db.prepare(
    `SELECT country, COALESCE(SUM(planned_count), 0) AS crusades, COUNT(DISTINCT registration_id) AS registrations
     FROM registration_items i
     WHERE ${PUBLIC_PROGRAM_FILTER} AND country IS NOT NULL AND TRIM(country) <> ''
     GROUP BY country COLLATE NOCASE`
  ).all();
  const byCanonical = new Map();
  for (const row of raw) {
    const key = resolveCountryName(row.country) || row.country;
    const existing = byCanonical.get(key);
    if (existing) {
      existing.crusades += Number(row.crusades);
      existing.registrations += Number(row.registrations);
    } else {
      byCanonical.set(key, { country: key, crusades: Number(row.crusades), registrations: Number(row.registrations) });
    }
  }
  const rows = [...byCanonical.values()].map((row) => ({
    ...row,
    continent: continentByCountry.get(row.country.toLowerCase()) || "Other",
  })).sort((a, b) => a.continent.localeCompare(b.continent)
    || Number(b.crusades) - Number(a.crusades)
    || a.country.localeCompare(b.country));
  const numbered = rows.map((row, index) => ({ ...row, number: index + 1 }));
  const crusades = rows.reduce((sum, row) => sum + Number(row.crusades || 0), 0);
  await sendExport(res, "pdf", "registrations-by-continent-and-country", [
    { header: "#", value: (row) => row.number, pdfWidth: 0.3, align: "right" },
    { header: "Continent", value: (row) => row.continent, pdfWidth: 1.4 },
    { header: "Country", value: (row) => row.country, pdfWidth: 2.2 },
    { header: "Registered crusades", value: (row) => row.crusades, pdfWidth: 1.2, align: "right" },
    { header: "Registration entries", value: (row) => row.registrations, pdfWidth: 1.2, align: "right" },
  ], numbered, {
    title: "Registrations by Continent and Country",
    subtitle: `${rows.length} countries represented | ${crusades} registered crusades`,
  });
}));

// Shared WHERE clause for the registrations table and its export.
// Always scoped to public registrations (NULL allowed for pre-migration rows)
// so Blue Elite rows never appear in the original admin table.
export function registrationFilters(query) {
  const where = ["(r.program = 'public' OR r.program IS NULL)"];
  const params = {};
  for (const col of ["organization_type", "zone", "group_name", "church_name", "cell_name", "network_name"]) {
    if (query[col]) { where.push(`r.${col} = @${col}`); params[col] = String(query[col]); }
  }
  // Country is per crusade now, so match the crusade's own country (i), not the registration's primary.
  if (query.country) { where.push("i.country = @country"); params.country = String(query.country); }
  if (query.city) { where.push("i.city = @city"); params.city = String(query.city); }
  if (query.readiness_status) { where.push("i.readiness_status = @readiness_status"); params.readiness_status = String(query.readiness_status); }
  if (query.report_status === "reported") where.push("EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id)");
  if (query.report_status === "unreported") where.push("NOT EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id)");
  if (query.cellular === "1") where.push(CELLULAR_ITEM_FILTER);
  if (query.event_type) { where.push("i.event_type = @event_type"); params.event_type = String(query.event_type); }
  const excludedTypes = [...new Set(String(query.exclude_event_type || "").split(",")
    .map((value) => value.trim()).filter((value) => value && value.length <= 100))].slice(0, 30);
  if (excludedTypes.length) {
    const placeholders = excludedTypes.map((value, index) => {
      const key = `exclude_event_type_${index}`;
      params[key] = value;
      return `@${key}`;
    });
    where.push(`i.event_type NOT IN (${placeholders.join(", ")})`);
  }
  if (query.date_from) { where.push("i.event_date >= @date_from"); params.date_from = String(query.date_from); }
  if (query.date_to) { where.push("i.event_date <= @date_to"); params.date_to = String(query.date_to); }
  const minAttendance = parseInt(query.min_attendance, 10);
  if (Number.isFinite(minAttendance) && minAttendance > 0) {
    where.push("i.expected_attendance >= @min_attendance"); params.min_attendance = minAttendance;
  }
  // Free-text search: every word must match some field of the registration or its items.
  String(query.q || "").trim().split(/\s+/).filter(Boolean).slice(0, 8).forEach((tok, n) => {
    const p = `q${n}`;
    where.push(`(r.zone LIKE @${p} OR r.group_name LIKE @${p} OR r.church_name LIKE @${p} OR r.network_name LIKE @${p} OR r.country LIKE @${p}
      OR r.contact_name LIKE @${p} OR r.contact_email LIKE @${p} OR r.phone_country_code || r.phone_number LIKE @${p}
      OR r.kingschat_username LIKE @${p}
      OR i.country LIKE @${p} OR i.city LIKE @${p} OR i.event_type LIKE @${p} OR i.event_name LIKE @${p} OR i.venue LIKE @${p}
      OR i.readiness_status LIKE @${p} OR i.readiness_notes LIKE @${p})`);
    params[p] = `%${tok}%`;
  });
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

const REGISTRATION_EXPORT_SELECT =
  `SELECT i.event_type, i.event_name, i.event_date, i.venue, i.expected_attendance, i.minister_name, i.country, i.city,
          i.readiness_status, i.readiness_notes,
          i.crusade_collaborators, i.zone_contribution, i.estimated_budget, i.rhapsody_copies_confirmed, i.permits_obtained, i.media_coverage_plan,
          r.created_at AS registered_at, r.organization_type, r.zone, r.group_name, r.church_name, r.cell_name, r.network_name,
          r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username,
          EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id) AS report_submitted
   FROM registration_items i JOIN registrations r ON r.id = i.registration_id`;

const REGISTRATION_EXPORT_COLUMNS = [
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
  { header: "Registered as", value: (row) => ORG_TYPE_LABELS[row.organization_type] || row.organization_type },
  { header: "Zone", value: (row) => row.zone },
  { header: "Group", value: (row) => row.group_name },
  { header: "Church", value: (row) => row.church_name },
  { header: "Cell", value: (row) => row.cell_name },
  { header: "Network", value: (row) => row.network_name },
  { header: "Contact name", value: (row) => row.contact_name },
  { header: "Contact email", value: (row) => row.contact_email },
  { header: "Contact phone", value: (row) => phone(row.phone_country_code, row.phone_number) },
  { header: "KingsChat", value: (row) => row.kingschat_username },
  // Network-only planning fields (blank for other org types)
  { header: "Crusade collaborators", value: (row) => row.crusade_collaborators },
  { header: "Zone's contribution", value: (row) => row.zone_contribution },
  { header: "Estimated budget (Espees)", value: (row) => row.estimated_budget },
  { header: "Rhapsody copies confirmed", value: (row) => row.rhapsody_copies_confirmed },
  { header: "Permits obtained", value: (row) => row.permits_obtained },
  { header: "Media coverage plan", value: (row) => row.media_coverage_plan },
];

// GET /api/registrations/export?format=csv|xlsx — all rows matching the current filters.
registrations.get("/export", requirePageAccess("registrations"), wrap(async (req, res) => {
  const { clause, params } = registrationFilters(req.query);
  const rows = db.prepare(`${REGISTRATION_EXPORT_SELECT} ${clause} ORDER BY i.id DESC`).iterate(params);
  await sendStreamingExport(res, req.query.format === "xlsx" ? "xlsx" : "csv", "registered-crusades", REGISTRATION_EXPORT_COLUMNS, rows);
}));

// GET /api/registrations — paginated, filtered, sorted table for the admin view.
registrations.get("/", requireExternalOrPageAccess(["registrations"]), wrap((req, res) => {
  const { clause, params } = registrationFilters(req.query);
  if (req.externalApi) {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const cursor = Math.max(parseInt(req.query.cursor, 10) || 0, 0);
    const rows = db.prepare(
      `SELECT i.id, i.registration_id, i.created_at, i.program, i.organization_type, i.zone, i.group_name,
              i.church_name, i.cell_name, i.network_name, i.country, i.plan_date, i.event_type, i.other_event_type,
              i.planned_count, i.event_name, i.event_date, i.venue, i.expected_attendance, i.minister_name,
              i.city, i.city_place_id, i.readiness_status, i.readiness_notes, i.readiness_updated_at,
              i.crusade_collaborators, i.zone_contribution, i.estimated_budget, i.rhapsody_copies_confirmed,
              i.permits_obtained, i.media_coverage_plan,
              EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id) AS report_submitted
       FROM registration_items i JOIN registrations r ON r.id = i.registration_id
       ${clause}${clause ? " AND" : " WHERE"} (@cursor = 0 OR i.id < @cursor)
       ORDER BY i.id DESC LIMIT @limit_plus_one`
    ).all({ ...params, cursor, limit_plus_one: limit + 1 });
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    return res.json({ data, meta: { limit, has_more: hasMore, next_cursor: hasMore ? data.at(-1)?.id || null : null } });
  }
  const pageSize = Math.min(Math.max(parseInt(req.query.page_size, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const SORT = {
    created_at: "i.id", event_date: "i.event_date", event_name: "i.event_name COLLATE NOCASE",
    event_type: "i.event_type COLLATE NOCASE", expected_attendance: "i.expected_attendance",
    zone: "r.zone COLLATE NOCASE", country: "r.country COLLATE NOCASE", org: "org COLLATE NOCASE",
  };
  const sortCol = req.query.sort ? (SORT[req.query.sort] || "i.id") : "i.id";
  const dir = req.query.dir === "asc" ? "ASC" : "DESC";

  const countKey = `registrations-count:${JSON.stringify(params)}:${clause}`;
  const total = cachedDashboardData(countKey,
    () => db.prepare(`SELECT COUNT(*) AS n FROM registration_items i JOIN registrations r ON r.id = i.registration_id ${clause}`).get(params).n,
    60_000);
  const rows = db.prepare(
    `SELECT i.id, i.registration_id, i.event_type, i.planned_count, i.event_name, i.event_date, i.venue,
            i.expected_attendance, i.minister_name, i.city, i.city_place_id, i.readiness_status, i.readiness_notes, i.readiness_updated_at,
            i.crusade_collaborators, i.zone_contribution, i.estimated_budget, i.rhapsody_copies_confirmed, i.permits_obtained, i.media_coverage_plan,
            r.created_at AS registered_at, r.organization_type, r.zone, r.group_name, r.church_name, r.cell_name,
            r.network_name, r.country, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number,
            r.kingschat_username, ${ORG_LABEL} AS org,
            EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id) AS report_submitted,
            (SELECT c.id FROM crusades c WHERE c.registration_item_id = i.id LIMIT 1) AS report_crusade_id
     FROM registration_items i JOIN registrations r ON r.id = i.registration_id
     ${clause} ORDER BY ${sortCol} ${dir}, i.id DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  res.json({ rows, total, page, page_size: pageSize, filter_options: registrationFilterOptions() });
}));
