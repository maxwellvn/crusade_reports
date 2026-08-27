import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db, METRIC_FIELDS } from "../db.js";
import { wrap, ApiError } from "../logger.js";
import { requirePageAccess } from "../auth.js";
import { portalCrusadeReportSchema, registrationCrusadeEditSchema } from "../validation.js";
import { updateRegistrationCrusade } from "./registrations.js";
import { submitRegisteredCrusadeReport } from "./reports.js";
import { loadZones } from "./zones.js";
import { ensureReportingOpen, isNetworkDashboardInheritanceEnabled, isReportingOpen } from "../appSettings.js";
import { parseReportPayload, removeUploadedFiles, withReportPhotoUpload } from "../reportMedia.js";
import { sendStreamingExport } from "./exporter.js";
import { typeLabel, READINESS_LABELS, ORG_TYPE_LABELS, FORMAT_LABELS, METRIC_LABELS, yesNo, phone } from "../labels.js";
import multer from "multer";
import { buildPortalReportWorkbook, parsePortalReportWorkbook } from "../portalReportTemplate.js";
import { ONLINE_TYPES } from "../../client/src/lib/constants.js";
import { portalItemOrder, PORTAL_UNREGISTERED_REPORT_ORDER } from "../reportOrdering.js";
import { portalReportPreview } from "../portalReportImport.js";
import { personalDashboardScope } from "../portalVisibility.js";
import { cachedDashboardData } from "../dashboardCache.js";

export const zonePortal = Router();
const portalTemplateUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

export function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function invalidMediaLink(value) {
  for (const link of String(value || "").split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean)) {
    try {
      const url = new URL(link);
      if (!["http:", "https:"].includes(url.protocol)) return link;
    } catch {
      return link;
    }
  }
  return "";
}

export function changedPortalTemplateFields(uploaded, item) {
  const expectedFormat = ONLINE_TYPES.includes(item.event_type) ? "online" : "physical";
  const expectedOtherType = item.event_type === "other" ? (item.other_event_type || "Other") : (item.other_event_type || "");
  return [
    ["Registered Crusade", uploaded.registered_event_name, item.event_name],
    ["Registered Type", uploaded.registered_event_type, item.event_type],
    ["Registered Date", uploaded.registered_event_date, item.event_date || item.plan_date],
    ["Country", uploaded.registered_country, item.country],
    ["Format", uploaded.format, expectedFormat],
    ["Other Crusade Type", uploaded.other_event_type, expectedOtherType],
    ["Date Held", uploaded.event_date, item.event_date || item.plan_date],
    ["City", uploaded.city, item.city],
    ["Venue / Address", uploaded.venue, item.venue],
    ["Minister", uploaded.minister_name, item.minister_name],
    ["Highlights", uploaded.highlights, ""],
  ].filter(([, uploadedValue, storedValue]) => String(uploadedValue || "").trim() !== String(storedValue || "").trim()).map(([label]) => label);
}

export const currentDirectoryZoneNames = (directory) => [...new Set(directory.map((entry) => entry.zone).filter(Boolean))];

// GET /api/zone-links — current Churches API zones and all networks, each with
// its token if one exists. The directory is authoritative for zone visibility:
// deleted/renamed zones must not be reintroduced by stale tokens or old reports.
zonePortal.get("/zone-links", requirePageAccess("dashboard/zone-links"), wrap(async (req, res) => {
  const tokens = db.prepare("SELECT zone AS name, token, kind FROM zone_tokens").all();
  const tokenFor = (kind, name) => tokens.find((t) => t.kind === kind && t.name === name)?.token || null;

  const zoneNames = new Set(currentDirectoryZoneNames(await loadZones().catch(() => [])));

  const networkNames = new Set(db.prepare("SELECT name FROM networks").all().map((r) => r.name));
  db.prepare(`SELECT DISTINCT network_name AS n FROM registrations WHERE network_name IS NOT NULL
              UNION SELECT DISTINCT network_name FROM crusades WHERE network_name IS NOT NULL`).all()
    .forEach((r) => networkNames.add(r.n));
  tokens.filter((t) => t.kind === "network").forEach((t) => networkNames.add(t.name));

  const sortByName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  res.json({
    zones: [...zoneNames].map((name) => ({ name, token: tokenFor("zone", name) })).sort(sortByName),
    networks: [...networkNames].map((name) => ({ name, token: tokenFor("network", name) })).sort(sortByName),
  });
}));

// POST /api/zone-links { name, kind } — create or regenerate a token.
zonePortal.post("/zone-links", requirePageAccess("dashboard/zone-links"), wrap((req, res) => {
  const name = String(req.body?.name || "").trim();
  const kind = req.body?.kind === "network" ? "network" : "zone";
  if (!name) throw new ApiError(422, "VALIDATION", "Name is required");
  const token = randomBytes(16).toString("base64url");
  db.prepare(`
    INSERT INTO zone_tokens (zone, token, kind) VALUES (?, ?, ?)
    ON CONFLICT(zone) DO UPDATE SET token = excluded.token, kind = excluded.kind, created_at = datetime('now')
  `).run(name, token, kind);
  res.json({ name, kind, token });
}));

// ---- Zone portal: token-scoped data ------------------------------------------

function resolvePortalScope(tokenValue) {
  const row = db.prepare("SELECT zone AS name, kind FROM zone_tokens WHERE token = ?").get(tokenValue);
  if (!row) throw new ApiError(404, "NOT_FOUND", "This link is not valid — ask your coordinator for a new one.");
  const { name, kind } = row;
  const inheritedVisibilityEnabled = isNetworkDashboardInheritanceEnabled(name);
  const { col, listWhere, listParams, totalsWhere, totalsParams, registrationsWhere, registrationsParams } = personalDashboardScope({
    name,
    kind,
    includeInherited: inheritedVisibilityEnabled,
  });

  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || kind;
  return { name, kind, col, listWhere, listParams, totalsWhere, totalsParams, registrationsWhere, registrationsParams, inheritedVisibilityEnabled, slug };
}

const PORTAL_REGISTRATION_EXPORT_COLUMNS = [
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
  { header: "Crusade collaborators", value: (row) => row.crusade_collaborators },
  { header: "Zone's contribution", value: (row) => row.zone_contribution },
  { header: "Estimated budget (Espees)", value: (row) => row.estimated_budget },
  { header: "Rhapsody copies confirmed", value: (row) => row.rhapsody_copies_confirmed },
  { header: "Permits obtained", value: (row) => row.permits_obtained },
  { header: "Media coverage plan", value: (row) => row.media_coverage_plan },
];

const PORTAL_REPORT_EXPORT_COLUMNS = [
  { header: "Submitted at (UTC)", value: (row) => row.reported_at || row.created_at },
  { header: "Date held", value: (row) => row.event_date },
  { header: "Crusade name", value: (row) => row.event_name },
  { header: "Type", value: (row) => typeLabel(row.event_type, row.other_event_type) },
  { header: "Format", value: (row) => FORMAT_LABELS[row.format] || row.format },
  { header: "Country", value: (row) => row.country },
  { header: "City", value: (row) => row.city },
  { header: "Venue / address", value: (row) => row.venue },
  { header: "Ministers", value: (row) => row.minister_name },
  { header: "Reporting level", value: (row) => ORG_TYPE_LABELS[row.organization_type] || row.organization_type },
  { header: "Zone", value: (row) => row.zone },
  { header: "Group", value: (row) => row.group_name },
  { header: "Church", value: (row) => row.church_name },
  { header: "Cell", value: (row) => row.cell_name },
  { header: "Network", value: (row) => row.network_name },
  { header: "Onsite attendance", value: (row) => row.attendance },
  { header: "Crusade expense", value: (row) => row.crusade_expense },
  ...METRIC_FIELDS.map((field) => ({ header: METRIC_LABELS[field] || field, value: (row) => row[field] })),
  { header: "Contact name", value: (row) => row.contact_name },
  { header: "Contact email", value: (row) => row.contact_email },
  { header: "Contact phone", value: (row) => phone(row.phone_country_code, row.phone_number) },
  { header: "KingsChat", value: (row) => row.kingschat_username },
  { header: "Had prior registration", value: (row) => yesNo(row.registration_item_id) },
];

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// Escape LIKE wildcards so user searches match literally.
const escapeLike = (value) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

// Build an extra SQL filter fragment for the portal list queries from the
// dashboard's search box and filter selects. The scope clause (listWhere) is
// always applied first; these are additive user filters.
function buildListFilter({ q, eventType, readiness, source, scopeSql, scopeParams, scopeKind, prefix = "" }) {
  const p = prefix;
  const clauses = [];
  const params = [];
  if (q) {
    const like = `%${escapeLike(q)}%`;
    clauses.push(`(LOWER(COALESCE(${p}event_name, '')) LIKE LOWER(?) ESCAPE '\\'
        OR LOWER(COALESCE(${p}event_type, '')) LIKE LOWER(?) ESCAPE '\\'
        OR LOWER(COALESCE(${p}country, '')) LIKE LOWER(?) ESCAPE '\\'
        OR LOWER(COALESCE(${p}city, '')) LIKE LOWER(?) ESCAPE '\\'
        OR LOWER(COALESCE(${p}venue, '')) LIKE LOWER(?) ESCAPE '\\'
        OR COALESCE(${p}event_date, '') LIKE ?)`);
    params.push(like, like, like, like, like, like);
  }
  if (eventType) { clauses.push(`${p}event_type = ?`); params.push(eventType); }
  if (readiness) { clauses.push(`${p}readiness_status = ?`); params.push(readiness); }
  // The source filter only makes sense on network dashboards. It is derived
  // from the same visitor logic the client used: a row whose scope column does
  // not equal the portal's name is a "visitor" and its source is its
  // organization_type (or "other"); the portal's own rows have source = kind.
  if (source) {
    clauses.push(`CASE WHEN ${scopeSql} = ? THEN '${scopeKind}' ELSE COALESCE(NULLIF(${p}organization_type, ''), 'other') END = ?`);
    params.push(...scopeParams, source);
  }
  if (!clauses.length) return { sql: "", params };
  return { sql: ` AND ${clauses.join(" AND ")}`, params };
}

// GET /api/zone-portal/:token — everything the zone dashboard shows. Every query
// is scoped to the token's zone; there is no way to reach another zone's rows.
// List payloads are paginated server-side so dashboards with thousands of
// crusades stay fast; totals and breakdowns are always computed over the full
// scoped set, never the page.
zonePortal.get("/zone-portal/:token", wrap((req, res) => {
  const { name, kind, col, listWhere, listParams, totalsWhere, totalsParams, registrationsWhere, registrationsParams, inheritedVisibilityEnabled } = resolvePortalScope(req.params.token);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.page_size, 10) || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const registrations = db.prepare(`
    SELECT r.id, r.created_at, r.organization_type, r.group_name, r.church_name, r.country, r.plan_date,
           COALESCE(SUM(i.planned_count), 0) AS planned
    FROM registrations r LEFT JOIN registration_items i ON i.registration_id = r.id
    WHERE ${registrationsWhere} AND (r.program = 'public' OR r.program IS NULL)
    GROUP BY r.id ORDER BY r.created_at DESC LIMIT 500
  `).all(...registrationsParams);

  // Items: scoped + filtered + paginated. The search/filters come from the
  // dashboard's query params so the page reflects the applied filters.
  const filter = buildListFilter({
    q: (req.query.q || "").trim(),
    eventType: req.query.event_type || "",
    readiness: req.query.readiness_status || "",
    source: req.query.source || "",
    scopeSql: `registration_items.${col}`,
    scopeParams: [name],
    scopeKind: kind,
    prefix: "registration_items.",
  });
  const scopeItemsSql = `(${listWhere("registration_items.")}) AND (registration_items.program = 'public' OR registration_items.program IS NULL)`;
  const listCountKey = `portal-items-count:${kind}:${name}:${inheritedVisibilityEnabled ? 1 : 0}:${JSON.stringify(filter.params)}:${filter.sql}`;
  const itemsTotal = cachedDashboardData(listCountKey,
    () => db.prepare(`SELECT COUNT(*) n FROM registration_items WHERE ${scopeItemsSql}${filter.sql}`).get(...listParams, ...filter.params).n,
    30_000);

  const itemOrder = portalItemOrder(req.query.view);
  const items = db.prepare(`
    SELECT registration_items.id, registration_items.registration_id, registration_items.event_type,
           registration_items.planned_count, registration_items.event_name,
           COALESCE(registration_items.event_date, registration_items.plan_date) AS event_date,
           registration_items.venue, registration_items.expected_attendance, registration_items.minister_name,
           registration_items.organization_type, registration_items.zone, registration_items.group_name,
           registration_items.church_name, registration_items.cell_name, registration_items.network_name,
           registration_items.city, registration_items.country, registration_items.city_place_id,
           registration_items.crusade_collaborators, registration_items.zone_contribution,
           registration_items.estimated_budget, registration_items.rhapsody_copies_confirmed,
           registration_items.permits_obtained, registration_items.media_coverage_plan,
           registration_items.readiness_status, registration_items.readiness_notes, registration_items.readiness_updated_at,
           crusades.id AS report_crusade_id, crusades.report_id, crusades.created_at AS reported_at,
           crusades.attendance AS reported_attendance, crusades.online_participation AS reported_online_participation,
           crusades.salvation AS reported_salvation,
           reg.contact_name, reg.contact_email, reg.phone_country_code, reg.phone_number, reg.kingschat_username
    FROM registration_items
    LEFT JOIN registrations reg ON reg.id = registration_items.registration_id
    LEFT JOIN crusades ON crusades.registration_item_id = registration_items.id
    WHERE ${scopeItemsSql}${filter.sql}
    ORDER BY ${itemOrder}
    LIMIT ? OFFSET ?
  `).all(...listParams, ...filter.params, pageSize, offset).map((r) => {
    const visitor = r[col] !== name;
    return { ...r, visitor, source_scope: visitor ? (r.organization_type || "other") : kind };
  });

  // Unregistered crusade reports (the "didn't register" form) — paginated too.
  const crusadeFilter = buildListFilter({
    q: (req.query.q || "").trim(),
    eventType: req.query.event_type || "",
    readiness: "",
    source: req.query.source || "",
    scopeSql: col,
    scopeParams: [name],
    scopeKind: kind,
    prefix: "",
  });
  const scopeCrusadesSql = `(${listWhere("")}) AND registration_item_id IS NULL`;
  const reportCountKey = `portal-reports-count:${kind}:${name}:${inheritedVisibilityEnabled ? 1 : 0}:${JSON.stringify(crusadeFilter.params)}:${crusadeFilter.sql}`;
  const crusadesTotal = cachedDashboardData(reportCountKey,
    () => db.prepare(`SELECT COUNT(*) n FROM crusades WHERE ${scopeCrusadesSql}${crusadeFilter.sql}`).get(...listParams, ...crusadeFilter.params).n,
    30_000);

  const crusades = db.prepare(`
    SELECT id, registration_item_id, created_at AS reported_at, event_date, event_type, other_event_type, event_name, format, city, country,
           organization_type, zone, group_name, church_name, cell_name, network_name,
           attendance, online_participation, salvation, minister_name, venue
    FROM crusades WHERE ${scopeCrusadesSql}${crusadeFilter.sql} ORDER BY ${PORTAL_UNREGISTERED_REPORT_ORDER} LIMIT ? OFFSET ?
  `).all(...listParams, ...crusadeFilter.params, pageSize, offset).map((r) => {
    const visitor = r[col] !== name;
    return { ...r, visitor, source_scope: visitor ? (r.organization_type || "other") : kind };
  });

  // Source breakdown over the FULL scoped set (not the page) so the network
  // dashboard's aggregate card stays correct regardless of pagination.
  const aggregateKey = `portal-aggregates:${kind}:${name}:${inheritedVisibilityEnabled ? 1 : 0}`;
  const aggregates = cachedDashboardData(aggregateKey, () => {
    let source_breakdown = db.prepare(`
      SELECT CASE WHEN ${col} = ? THEN '${kind}'
                  ELSE COALESCE(NULLIF(organization_type, ''), 'other') END AS source,
             COALESCE(SUM(planned_count), 0) AS planned
      FROM registration_items
      WHERE ${scopeItemsSql}
      GROUP BY source
    `).all(name, ...listParams);
    const sourceOrder = ["network", "zone", "group", "church", "cell", "other"];
    const sourceByKey = new Map(source_breakdown.map((entry) => [entry.source, entry.planned]));
    source_breakdown = sourceOrder
      .filter((source) => sourceByKey.has(source))
      .map((source) => ({ source, planned: sourceByKey.get(source) }));

  // Count of this portal's own registered crusades still awaiting a report.
    const pendingCount = db.prepare(`
      SELECT COUNT(*) n FROM registration_items
      LEFT JOIN crusades c ON c.registration_item_id = registration_items.id
      WHERE registration_items.${col} = ? AND c.report_id IS NULL
        AND (registration_items.program = 'public' OR registration_items.program IS NULL)
    `).get(name).n;

    const totals = {
      planned: db.prepare(`SELECT COALESCE(SUM(planned_count),0) n FROM registration_items WHERE ${totalsWhere} AND (program = 'public' OR program IS NULL)`).get(...totalsParams).n,
      held: db.prepare(`SELECT COUNT(*) n FROM crusades WHERE ${totalsWhere}`).get(...totalsParams).n,
      attendance: db.prepare(`SELECT COALESCE(SUM(attendance + online_participation),0) n FROM crusades WHERE ${totalsWhere}`).get(...totalsParams).n,
      salvation: db.prepare(`SELECT COALESCE(SUM(salvation),0) n FROM crusades WHERE ${totalsWhere}`).get(...totalsParams).n,
    };
    return { source_breakdown, pendingCount, totals };
  }, 60_000);

  res.setHeader("Cache-Control", "private, max-age=15");
  res.json({ zone: name, kind, inherited_visibility_enabled: inheritedVisibilityEnabled, reporting_open: isReportingOpen(), ...aggregates, registrations, items, items_total: itemsTotal, crusades, crusades_total: crusadesTotal });
}));

// CSV/Excel export of registered crusades visible on this dashboard.
zonePortal.get("/zone-portal/:token/export/registrations", wrap(async (req, res) => {
  const { listWhere, listParams, slug } = resolvePortalScope(req.params.token);
  const rows = db.prepare(`
    SELECT i.event_type, i.event_name, COALESCE(i.event_date, i.plan_date) AS event_date, i.venue, i.expected_attendance,
           i.minister_name, i.country, i.city, i.readiness_status, i.readiness_notes,
           i.crusade_collaborators, i.zone_contribution, i.estimated_budget, i.rhapsody_copies_confirmed,
           i.permits_obtained, i.media_coverage_plan,
           r.created_at AS registered_at, i.organization_type, i.zone, i.group_name, i.church_name, i.cell_name, i.network_name,
           r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username,
           EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id) AS report_submitted
    FROM registration_items i
    JOIN registrations r ON r.id = i.registration_id
    WHERE ${listWhere("i.")} AND (i.program = 'public' OR i.program IS NULL)
    ORDER BY COALESCE(i.event_date, i.plan_date), i.id
  `).iterate(...listParams);
  await sendStreamingExport(res, req.query.format === "xlsx" ? "xlsx" : "csv", `${slug}-registrations`, PORTAL_REGISTRATION_EXPORT_COLUMNS, rows);
}));

// CSV/Excel export of submitted crusade reports visible on this dashboard.
zonePortal.get("/zone-portal/:token/export/reports", wrap(async (req, res) => {
  const { listWhere, listParams, slug } = resolvePortalScope(req.params.token);
  const rows = db.prepare(`
    SELECT c.event_date, c.format, c.event_type, c.other_event_type, c.event_name, c.city, c.country,
           c.organization_type, c.zone, c.group_name, c.church_name, c.cell_name, c.network_name,
           c.attendance, c.crusade_expense, ${METRIC_FIELDS.map((field) => `c.${field}`).join(", ")},
           c.minister_name, c.venue, c.registration_item_id,
           r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username
    FROM crusades c
    LEFT JOIN reports r ON r.id = c.report_id
    WHERE ${listWhere("c.")}
    ORDER BY c.created_at DESC, c.id DESC
  `).iterate(...listParams);
  await sendStreamingExport(res, req.query.format === "xlsx" ? "xlsx" : "csv", `${slug}-reports`, PORTAL_REPORT_EXPORT_COLUMNS, rows);
}));

// Download a protected Excel workbook containing this dashboard's own
// registrations that do not yet have reports. Network visitor rows are excluded.
zonePortal.get("/zone-portal/:token/report-template", wrap(async (req, res) => {
  ensureReportingOpen();
  const { name, kind, col, slug } = resolvePortalScope(req.params.token);
  const rows = db.prepare(`
    SELECT i.id, i.event_type,
           CASE WHEN i.event_type = 'other' THEN COALESCE(NULLIF(i.other_event_type, ''), 'Other') ELSE COALESCE(i.other_event_type, '') END AS other_event_type,
           i.event_name, COALESCE(i.event_date, i.plan_date) AS event_date,
           i.country, i.city, i.city_place_id, i.venue, i.minister_name
    FROM registration_items i
    WHERE i.${col} = ? AND (i.program = 'public' OR i.program IS NULL)
      AND NOT EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id)
    ORDER BY COALESCE(i.event_date, i.plan_date), i.id
  `).all(name);
  const workbook = await buildPortalReportWorkbook(rows, `${name} ${kind} dashboard`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${slug}-report-template.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}));

// Preview or commit a completed workbook. Every Registration ID is resolved
// again under the capability token before validation or insertion.
zonePortal.post("/zone-portal/:token/report-template", portalTemplateUpload.single("file"), wrap(async (req, res) => {
  ensureReportingOpen();
  if (!req.file) throw new ApiError(400, "NO_FILE", "Choose a completed .xlsx report template.");
  const scope = resolvePortalScope(req.params.token);
  let parsedWorkbook;
  try {
    parsedWorkbook = await parsePortalReportWorkbook(req.file.buffer);
  } catch (error) {
    throw new ApiError(422, "BAD_TEMPLATE", error.message || "Could not read the report template.");
  }

  const errors = [...parsedWorkbook.errors];
  const validated = [];
  for (const uploaded of parsedWorkbook.reports) {
    const item = db.prepare(`
      SELECT i.*, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username
      FROM registration_items i JOIN registrations r ON r.id = i.registration_id
      WHERE i.id = ? AND i.${scope.col} = ? AND (i.program = 'public' OR i.program IS NULL)
    `).get(uploaded.registration_item_id, scope.name);
    if (!item) {
      errors.push(`Row ${uploaded.row_number}: Registration ID ${uploaded.registration_item_id} does not belong to this dashboard.`);
      continue;
    }
    if (db.prepare("SELECT 1 FROM crusades WHERE registration_item_id = ?").get(item.id)) {
      errors.push(`Row ${uploaded.row_number}: ${item.event_name || `Registration ${item.id}`} already has a submitted report.`);
      continue;
    }
    const changedFixedFields = changedPortalTemplateFields(uploaded, item);
    if (changedFixedFields.length) {
      errors.push(`Row ${uploaded.row_number}: protected registration fields were changed (${changedFixedFields.join(", ")}). Download a fresh template.`);
      continue;
    }
    if (!validIsoDate(uploaded.event_date)) {
      errors.push(`Row ${uploaded.row_number}: Date Held must be a valid date in YYYY-MM-DD format.`);
      continue;
    }
    const badPhotoLink = invalidMediaLink(uploaded.photo_links);
    const badVideoLink = invalidMediaLink(uploaded.video_links);
    if (badPhotoLink || badVideoLink) {
      errors.push(`Row ${uploaded.row_number}: ${badPhotoLink ? "Photo Links" : "Video Links"} contains an invalid link. Use complete http:// or https:// links, separated by commas or new lines.`);
      continue;
    }
    const crusade = {
      format: ONLINE_TYPES.includes(item.event_type) ? "online" : "physical",
      event_type: item.event_type,
      other_event_type: item.event_type === "other" ? (item.other_event_type || "Other") : (item.other_event_type || ""),
      event_name: item.event_name,
      country: item.country,
      city: item.city,
      city_place_id: item.city_place_id || "",
      event_date: item.event_date || item.plan_date,
      attendance: uploaded.attendance,
      crusade_expense: uploaded.crusade_expense,
      minister_name: item.minister_name,
      venue: item.venue,
      ...Object.fromEntries(METRIC_FIELDS.map((field) => [field, uploaded[field] || 0])),
    };
    const body = { crusade, highlights: "", photo_links: uploaded.photo_links, video_links: uploaded.video_links };
    const parsed = portalCrusadeReportSchema.safeParse(body);
    if (!parsed.success) {
      errors.push(`Row ${uploaded.row_number}: ${parsed.error.issues[0]?.message || "Check the report details."}`);
      continue;
    }
    validated.push({ item, body: parsed.data, row_number: uploaded.row_number });
  }

  const summary = {
    reports: validated.length,
    attendance: validated.reduce((sum, entry) => sum + entry.body.crusade.attendance + entry.body.crusade.online_participation, 0),
    salvations: validated.reduce((sum, entry) => sum + entry.body.crusade.salvation, 0),
  };
  if (errors.length) return res.json({ ok: false, errors: errors.slice(0, 100), summary });
  if (req.query.commit !== "1") {
    return res.json(portalReportPreview(validated, summary));
  }

  const submitted = db.transaction(() => validated.map(({ item, body }) => ({
    registration_item_id: item.id,
    ...submitRegisteredCrusadeReport(item, body),
  })))();
  res.status(201).json({ ok: true, submitted: submitted.length, summary, reports: submitted });
}));

// The capability token may update only individual crusades belonging to its zone/network.
zonePortal.put("/zone-portal/:token/crusades/:id/readiness", wrap((req, res) => {
  const token = db.prepare("SELECT zone AS name, kind FROM zone_tokens WHERE token = ?").get(req.params.token);
  if (!token) throw new ApiError(404, "NOT_FOUND", "This link is not valid — ask your coordinator for a new one.");

  const parsed = registrationCrusadeEditSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid crusade details.");
  const d = parsed.data;

  const col = token.kind === "network" ? "network_name" : "zone";
  const crusade = db.prepare(`SELECT id, registration_id, readiness_status FROM registration_items WHERE id = ? AND ${col} = ?`).get(req.params.id, token.name);
  if (!crusade) throw new ApiError(404, "NOT_FOUND", "Registered crusade not found on this dashboard.");

  res.json(updateRegistrationCrusade(crusade.id, d));
}));

// Submit outcomes for one registered crusade. Organization and reporter details
// come from its registration, so a capability link cannot report as another org.
zonePortal.post("/zone-portal/:token/crusades/:id/report", withReportPhotoUpload(wrap((req, res) => {
  ensureReportingOpen();
  const files = req.files || [];
  const token = db.prepare("SELECT zone AS name, kind FROM zone_tokens WHERE token = ?").get(req.params.token);
  if (!token) {
    removeUploadedFiles(files);
    throw new ApiError(404, "NOT_FOUND", "This link is not valid — ask your coordinator for a new one.");
  }

  const col = token.kind === "network" ? "network_name" : "zone";
  const item = db.prepare(`
    SELECT i.*, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username
    FROM registration_items i JOIN registrations r ON r.id = i.registration_id
    WHERE i.id = ? AND i.${col} = ?
  `).get(req.params.id, token.name);
  if (!item) {
    removeUploadedFiles(files);
    throw new ApiError(404, "NOT_FOUND", "Registered crusade not found on this dashboard.");
  }
  res.status(201).json(submitRegisteredCrusadeReport(item, parseReportPayload(req), files));
})));
