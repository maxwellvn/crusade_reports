import { Router } from "express";
import { db, METRIC_FIELDS } from "../db.js";
import { requirePageAccess } from "../auth.js";
import { wrap } from "../logger.js";
import { FORMAT_LABELS, METRIC_LABELS, READINESS_LABELS, typeLabel, yesNo } from "../labels.js";
import { loadZones } from "./zones.js";
import { sendExport } from "./exporter.js";

export const blwCampus = Router();

const PAGE_KEY = "dashboard/blw-campus";
const PUBLIC_PROGRAM_FILTER = "(i.program = 'public' OR i.program IS NULL)";
const BLW_ZONE_SQL = (alias) => `${alias}.zone IS NOT NULL AND LOWER(TRIM(${alias}.zone)) LIKE 'blw%'`;

export const isBlwCampusZone = (value) => String(value || "").trim().toLowerCase().startsWith("blw");
const normalized = (value) => String(value || "").trim().toLowerCase();

async function campusZoneCatalog() {
  let directory = [];
  try {
    directory = await loadZones();
  } catch {
    // Activity remains available if the external church directory is temporarily unavailable.
  }

  const byName = new Map();
  for (const entry of directory) {
    if (!isBlwCampusZone(entry.zone)) continue;
    byName.set(normalized(entry.zone), { zone: entry.zone, region: entry.region || "Region not mapped" });
  }

  const recordedZones = db.prepare(`
    SELECT zone FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} AND ${BLW_ZONE_SQL("i")}
    UNION
    SELECT zone FROM crusades c WHERE ${BLW_ZONE_SQL("c")}
  `).all();
  for (const row of recordedZones) {
    const key = normalized(row.zone);
    if (key && !byName.has(key)) byName.set(key, { zone: String(row.zone).trim(), region: "Region not mapped" });
  }

  return [...byName.values()].sort((left, right) =>
    left.region.localeCompare(right.region) || left.zone.localeCompare(right.zone));
}

function regionWhere(query, alias, catalog, params, where) {
  if (query.zone) {
    params.zone = String(query.zone);
    where.push(`${alias}.zone = @zone COLLATE NOCASE`);
  }
  if (!query.region) return;
  const zones = catalog.filter((entry) => entry.region === query.region).map((entry) => normalized(entry.zone));
  if (!zones.length) {
    where.push("1 = 0");
    return;
  }
  const placeholders = zones.map((zone, index) => {
    const key = `region_zone_${index}`;
    params[key] = zone;
    return `@${key}`;
  });
  where.push(`LOWER(TRIM(${alias}.zone)) IN (${placeholders.join(", ")})`);
}

function activityFilters(query, { alias, catalog, dateColumn, searchColumns = [], registration = false }) {
  const params = {};
  const where = [BLW_ZONE_SQL(alias)];
  if (registration) where.push(PUBLIC_PROGRAM_FILTER);
  regionWhere(query, alias, catalog, params, where);
  if (query.event_type) {
    params.event_type = String(query.event_type);
    where.push(`${alias}.event_type = @event_type`);
  }
  if (query.date_from) {
    params.date_from = String(query.date_from);
    where.push(`${dateColumn} >= @date_from`);
  }
  if (query.date_to) {
    params.date_to = String(query.date_to);
    where.push(`${dateColumn} <= @date_to`);
  }
  if (registration && query.report_status === "reported") {
    where.push("EXISTS (SELECT 1 FROM crusades linked WHERE linked.registration_item_id = i.id)");
  } else if (registration && query.report_status === "unreported") {
    where.push("NOT EXISTS (SELECT 1 FROM crusades linked WHERE linked.registration_item_id = i.id)");
  }
  String(query.q || "").trim().split(/\s+/).filter(Boolean).slice(0, 8).forEach((token, index) => {
    if (!searchColumns.length) return;
    const key = `q_${index}`;
    params[key] = `%${token}%`;
    where.push(`(${searchColumns.map((column) => `${column} LIKE @${key}`).join(" OR ")})`);
  });
  return { clause: `WHERE ${where.join(" AND ")}`, params };
}

function regionForZone(catalog) {
  return new Map(catalog.map((entry) => [normalized(entry.zone), entry.region]));
}

export function buildBlwCampusBreakdown(catalog, registrationRows, reportRows) {
  const regionMap = regionForZone(catalog);
  const zones = new Map(catalog.map((entry) => [normalized(entry.zone), {
    zone: entry.zone,
    region: entry.region,
    registered_crusades: 0,
    registration_entries: 0,
    reports_submitted: 0,
    attendance: 0,
    souls_won: 0,
    rhapsody_distributed: 0,
    registered_types: {},
    reported_types: {},
  }]));
  const ensure = (zone) => {
    const key = normalized(zone);
    if (!zones.has(key)) zones.set(key, {
      zone: String(zone || "BLW zone not specified").trim(),
      region: regionMap.get(key) || "Region not mapped",
      registered_crusades: 0,
      registration_entries: 0,
      reports_submitted: 0,
      attendance: 0,
      souls_won: 0,
      rhapsody_distributed: 0,
      registered_types: {},
      reported_types: {},
    });
    return zones.get(key);
  };

  for (const row of registrationRows) {
    const zone = ensure(row.zone);
    const amount = Number(row.registered_crusades) || 0;
    zone.registered_crusades += amount;
    zone.registration_entries += Number(row.registration_entries) || 0;
    zone.registered_types[row.event_type] = (zone.registered_types[row.event_type] || 0) + amount;
  }
  for (const row of reportRows) {
    const zone = ensure(row.zone);
    const amount = Number(row.reports_submitted) || 0;
    zone.reports_submitted += amount;
    zone.attendance += Number(row.attendance) || 0;
    zone.souls_won += Number(row.souls_won) || 0;
    zone.rhapsody_distributed += Number(row.rhapsody_distributed) || 0;
    zone.reported_types[row.event_type] = (zone.reported_types[row.event_type] || 0) + amount;
  }

  const zoneRows = [...zones.values()].sort((left, right) =>
    left.region.localeCompare(right.region) || left.zone.localeCompare(right.zone));
  const regions = new Map();
  for (const row of zoneRows) {
    if (!regions.has(row.region)) regions.set(row.region, {
      region: row.region,
      zones: 0,
      zones_with_registrations: 0,
      registered_crusades: 0,
      registration_entries: 0,
      reports_submitted: 0,
      attendance: 0,
      souls_won: 0,
      rhapsody_distributed: 0,
    });
    const region = regions.get(row.region);
    region.zones += 1;
    if (row.registered_crusades > 0) region.zones_with_registrations += 1;
    for (const field of ["registered_crusades", "registration_entries", "reports_submitted", "attendance", "souls_won", "rhapsody_distributed"]) {
      region[field] += row[field];
    }
  }
  const regionRows = [...regions.values()];
  const totals = zoneRows.reduce((result, row) => {
    if (row.registered_crusades > 0) result.zones_with_registrations += 1;
    for (const field of ["registered_crusades", "registration_entries", "reports_submitted", "attendance", "souls_won", "rhapsody_distributed"]) {
      result[field] += row[field];
    }
    return result;
  }, {
    campus_regions: regionRows.length,
    campus_zones: zoneRows.length,
    zones_with_registrations: 0,
    registered_crusades: 0,
    registration_entries: 0,
    reports_submitted: 0,
    attendance: 0,
    souls_won: 0,
    rhapsody_distributed: 0,
  });
  return { summary: totals, regions: regionRows, zones: zoneRows };
}

export async function overviewData(query = {}, catalogOverride = null) {
  const catalog = catalogOverride || await campusZoneCatalog();
  const registrationFilter = activityFilters(query, {
    alias: "i", catalog, dateColumn: "i.event_date", registration: true,
  });
  const reportFilter = activityFilters(query, { alias: "c", catalog, dateColumn: "c.event_date" });
  const registrationRows = db.prepare(`
    SELECT TRIM(i.zone) AS zone, i.event_type,
           COALESCE(SUM(i.planned_count), 0) AS registered_crusades,
           COUNT(*) AS registration_entries
    FROM registration_items i ${registrationFilter.clause}
    GROUP BY i.zone COLLATE NOCASE, i.event_type
  `).all(registrationFilter.params);
  const reportRows = db.prepare(`
    SELECT TRIM(c.zone) AS zone, c.event_type, COUNT(*) AS reports_submitted,
           COALESCE(SUM(c.attendance), 0) AS attendance,
           COALESCE(SUM(c.salvation), 0) AS souls_won,
           COALESCE(SUM(c.ror_distributed), 0) AS rhapsody_distributed
    FROM crusades c ${reportFilter.clause}
    GROUP BY c.zone COLLATE NOCASE, c.event_type
  `).all(reportFilter.params);
  const filteredCatalog = catalog.filter((entry) =>
    (!query.region || entry.region === query.region) &&
    (!query.zone || normalized(entry.zone) === normalized(query.zone)));
  const breakdown = buildBlwCampusBreakdown(filteredCatalog, registrationRows, reportRows);
  const availableTypeRows = db.prepare(`
    SELECT event_type FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} AND ${BLW_ZONE_SQL("i")}
    UNION
    SELECT event_type FROM crusades c WHERE ${BLW_ZONE_SQL("c")}
  `).all();
  const activeTypes = [...new Set(availableTypeRows.map((row) => row.event_type).filter(Boolean))]
    .sort((left, right) => typeLabel(left).localeCompare(typeLabel(right)))
    .map((key) => ({ key, label: typeLabel(key) }));
  return {
    ...breakdown,
    filters: {
      regions: [...new Set(catalog.map((entry) => entry.region))],
      zones: catalog.map((entry) => entry.zone),
      zone_options: catalog,
      event_types: activeTypes,
    },
  };
}

const REGISTRATION_SEARCH_COLUMNS = ["i.event_name", "i.venue", "i.city", "i.country", "i.group_name", "i.church_name", "i.cell_name", "i.zone"];
const REPORT_SEARCH_COLUMNS = ["c.event_name", "c.venue", "c.city", "c.country", "c.group_name", "c.church_name", "c.cell_name", "c.zone", "c.minister_name"];

export async function registrationData(query, paginated = true, catalogOverride = null) {
  const catalog = catalogOverride || await campusZoneCatalog();
  const { clause, params } = activityFilters(query, {
    alias: "i", catalog, dateColumn: "i.event_date", searchColumns: REGISTRATION_SEARCH_COLUMNS, registration: true,
  });
  const from = "FROM registration_items i JOIN registrations r ON r.id = i.registration_id";
  const total = db.prepare(`SELECT COUNT(*) AS value ${from} ${clause}`).get(params).value;
  const pageSize = Math.min(Math.max(parseInt(query.page_size, 10) || 40, 1), 200);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = paginated ? "LIMIT @limit OFFSET @offset" : "";
  const rows = db.prepare(`
    SELECT i.id, i.zone, i.group_name, i.church_name, i.cell_name, i.country, i.city,
           i.event_name, i.event_type, i.other_event_type, i.event_date, i.venue,
           i.expected_attendance, i.planned_count, i.readiness_status,
           EXISTS (SELECT 1 FROM crusades linked WHERE linked.registration_item_id = i.id) AS report_submitted
    ${from} ${clause} ORDER BY i.id DESC ${limit}
  `).all(paginated ? { ...params, limit: pageSize, offset: (page - 1) * pageSize } : params);
  const regions = regionForZone(catalog);
  return { rows: rows.map((row) => ({ ...row, region: regions.get(normalized(row.zone)) || "Region not mapped" })), total, page, page_size: pageSize };
}

export async function reportData(query, paginated = true, catalogOverride = null) {
  const catalog = catalogOverride || await campusZoneCatalog();
  const { clause, params } = activityFilters(query, {
    alias: "c", catalog, dateColumn: "c.event_date", searchColumns: REPORT_SEARCH_COLUMNS,
  });
  const total = db.prepare(`SELECT COUNT(*) AS value FROM crusades c ${clause}`).get(params).value;
  const pageSize = Math.min(Math.max(parseInt(query.page_size, 10) || 40, 1), 200);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = paginated ? "LIMIT @limit OFFSET @offset" : "";
  const rows = db.prepare(`
    SELECT c.id, c.report_id, c.created_at AS submitted_at, c.zone, c.group_name, c.church_name, c.cell_name,
           c.country, c.city, c.event_name, c.event_type, c.other_event_type, c.event_date,
           c.format, c.venue, c.minister_name, c.attendance, c.crusade_expense,
           ${METRIC_FIELDS.map((field) => `c.${field}`).join(", ")}
    FROM crusades c
    ${clause} ORDER BY c.id DESC ${limit}
  `).all(paginated ? { ...params, limit: pageSize, offset: (page - 1) * pageSize } : params);
  const regions = regionForZone(catalog);
  return { rows: rows.map((row) => ({ ...row, region: regions.get(normalized(row.zone)) || "Region not mapped" })), total, page, page_size: pageSize };
}

blwCampus.get("/overview", requirePageAccess(PAGE_KEY), wrap(async (req, res) => {
  res.setHeader("Cache-Control", "private, max-age=30");
  res.json(await overviewData(req.query));
}));

blwCampus.get("/registrations", requirePageAccess(PAGE_KEY), wrap(async (req, res) => {
  res.json(await registrationData(req.query));
}));

blwCampus.get("/reports", requirePageAccess(PAGE_KEY), wrap(async (req, res) => {
  res.json(await reportData(req.query));
}));

blwCampus.get("/overview/export", requirePageAccess(PAGE_KEY), wrap(async (req, res) => {
  const data = await overviewData(req.query);
  await sendExport(res, ["xlsx", "pdf"].includes(req.query.format) ? req.query.format : "csv", "blw-campus-region-overview", [
    { header: "Campus region", value: (row) => row.region, pdfWidth: 2.5 },
    { header: "BLW zone", value: (row) => row.zone, pdfWidth: 3 },
    { header: "Registered crusades", value: (row) => row.registered_crusades, align: "right" },
    { header: "Registration entries", value: (row) => row.registration_entries, align: "right" },
    { header: "Reports submitted", value: (row) => row.reports_submitted, align: "right" },
    { header: "Attendance", value: (row) => row.attendance, align: "right" },
    { header: "Souls won", value: (row) => row.souls_won, align: "right" },
    { header: "Rhapsody distributed", value: (row) => row.rhapsody_distributed, align: "right" },
  ], data.zones, { title: "BLW Campus Region Overview", subtitle: "Registered crusades and submitted reports by BLW campus region and zone" });
}));

blwCampus.get("/registrations/export", requirePageAccess(PAGE_KEY), wrap(async (req, res) => {
  const data = await registrationData(req.query, false);
  await sendExport(res, ["xlsx", "pdf"].includes(req.query.format) ? req.query.format : "csv", "blw-campus-registered-crusades", [
    { header: "Campus region", value: (row) => row.region, pdfWidth: 2 },
    { header: "BLW zone", value: (row) => row.zone, pdfWidth: 2.5 },
    { header: "Group", value: (row) => row.group_name },
    { header: "Church", value: (row) => row.church_name },
    { header: "Crusade", value: (row) => row.event_name || typeLabel(row.event_type, row.other_event_type), pdfWidth: 2.5 },
    { header: "Type", value: (row) => typeLabel(row.event_type, row.other_event_type) },
    { header: "Date", value: (row) => row.event_date },
    { header: "Location", value: (row) => [row.city, row.country].filter(Boolean).join(", ") },
    { header: "Expected attendance", value: (row) => row.expected_attendance, align: "right" },
    { header: "Readiness", value: (row) => READINESS_LABELS[row.readiness_status] || row.readiness_status },
    { header: "Report submitted", value: (row) => yesNo(row.report_submitted) },
  ], data.rows, { title: "BLW Campus Registered Crusades" });
}));

blwCampus.get("/reports/export", requirePageAccess(PAGE_KEY), wrap(async (req, res) => {
  const data = await reportData(req.query, false);
  await sendExport(res, ["xlsx", "pdf"].includes(req.query.format) ? req.query.format : "csv", "blw-campus-crusade-reports", [
    { header: "Campus region", value: (row) => row.region, pdfWidth: 2 },
    { header: "BLW zone", value: (row) => row.zone, pdfWidth: 2.5 },
    { header: "Group", value: (row) => row.group_name },
    { header: "Church", value: (row) => row.church_name },
    { header: "Crusade", value: (row) => row.event_name || typeLabel(row.event_type, row.other_event_type), pdfWidth: 2.5 },
    { header: "Type", value: (row) => typeLabel(row.event_type, row.other_event_type) },
    { header: "Format", value: (row) => FORMAT_LABELS[row.format] || row.format },
    { header: "Date held", value: (row) => row.event_date },
    { header: "Location", value: (row) => [row.city, row.country].filter(Boolean).join(", ") },
    { header: "Attendance", value: (row) => row.attendance, align: "right" },
    ...METRIC_FIELDS.map((field) => ({ header: METRIC_LABELS[field] || field, value: (row) => row[field], align: "right" })),
  ], data.rows, { title: "BLW Campus Crusade Reports" });
}));
