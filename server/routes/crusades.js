import { Router } from "express";
import { db, METRIC_FIELDS } from "../db.js";
import { wrap, ApiError } from "../logger.js";
import { requireAnyPageAccess, requirePageAccess, requireSuperAdmin } from "../auth.js";
import { sendExport } from "./exporter.js";
import { typeLabel, METRIC_LABELS, FORMAT_LABELS, ORG_TYPE_LABELS, phone } from "../labels.js";
import {
  composeMediaLinks, deleteReportPhotos, listReportPhotos, parseReportPayload, removeUploadedFiles,
  saveReportPhotos, withReportPhotoUpload,
} from "../reportMedia.js";
import { ADMIN_REPORT_ORDER } from "../reportOrdering.js";
import { cachedDashboardData } from "../dashboardCache.js";

export const crusades = Router();

export function deleteCrusadeReport(id) {
  const row = db.prepare("SELECT id, report_id FROM crusades WHERE id = ?").get(id);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Report not found.");

  return db.transaction(() => {
    db.prepare("DELETE FROM crusades WHERE id = ?").run(row.id);
    const reportDeleted = !db.prepare("SELECT 1 FROM crusades WHERE report_id = ?").get(row.report_id);
    if (reportDeleted) {
      deleteReportPhotos(row.report_id);
      db.prepare("DELETE FROM reports WHERE id = ?").run(row.report_id);
    }
    return { id: row.id, report_id: row.report_id, report_deleted: reportDeleted };
  })();
}

// Exact-match filters are driven by dropdowns in the admin tables.
const FILTER_COLS = ["organization_type", "zone", "group_name", "church_name", "cell_name", "network_name", "country", "city", "event_type", "format"];
const CRUSADE_FILTER_OPTION_COLS = ["zone", "group_name", "church_name", "cell_name", "network_name", "country", "city"];

// Values for the PM/admin report-table dropdowns come from the complete report
// dataset, so newly submitted attribution values appear automatically.
export function crusadeFilterOptions() {
  return cachedDashboardData("crusade-filter-options", () => Object.fromEntries(CRUSADE_FILTER_OPTION_COLS.map((column) => [
    column,
    db.prepare(
      `SELECT DISTINCT TRIM(${column}) AS value
       FROM crusades
       WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''
       ORDER BY value COLLATE NOCASE LIMIT 500`
    ).all().map((row) => row.value),
  ])), 300_000);
}

// Build the shared WHERE clause for the table and its export, so both apply the
// exact same filters and free-text search.
function crusadeFilters(query) {
  const where = [];
  const params = {};
  for (const col of FILTER_COLS) {
    const v = query[col];
    if (v) { where.push(`c.${col} = @${col}`); params[col] = String(v); }
  }
  const excludedTypes = [...new Set(String(query.exclude_event_type || "").split(",")
    .map((value) => value.trim()).filter((value) => value && value.length <= 100))].slice(0, 30);
  if (excludedTypes.length) {
    const placeholders = excludedTypes.map((value, index) => {
      const key = `exclude_event_type_${index}`;
      params[key] = value;
      return `@${key}`;
    });
    where.push(`c.event_type NOT IN (${placeholders.join(", ")})`);
  }
  if (query.q) {
    const match = String(query.q).trim().split(/\s+/).slice(0, 8)
      .map((t) => `"${t.replace(/"/g, "")}"*`).join(" ");
    if (match.length > 3) {
      where.push(`(c.id IN (SELECT rowid FROM crusades_fts WHERE crusades_fts MATCH @q)
        OR r.contact_name LIKE @contact_q OR r.contact_email LIKE @contact_q
        OR r.phone_country_code || r.phone_number LIKE @contact_q
        OR r.kingschat_username LIKE @contact_q OR c.cell_name LIKE @contact_q)`);
      params.q = match;
      params.contact_q = `%${String(query.q).trim()}%`;
    }
  }
  if (query.date_from) { where.push("event_date >= @date_from"); params.date_from = String(query.date_from); }
  if (query.date_to) { where.push("event_date <= @date_to"); params.date_to = String(query.date_to); }
  const minAttendance = parseInt(query.min_attendance, 10);
  if (Number.isFinite(minAttendance) && minAttendance > 0) {
    where.push("c.attendance >= @min_attendance"); params.min_attendance = minAttendance;
  }
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

const CRUSADE_FROM = "FROM crusades c LEFT JOIN reports r ON r.id = c.report_id";
const CRUSADE_EXPORT_SELECT =
  `SELECT c.id, c.event_date, c.format, c.event_type, c.other_event_type, c.event_name, c.city, c.country,
          c.organization_type, c.zone, c.group_name, c.church_name, c.cell_name, c.network_name,
          c.created_at AS submitted_at, c.attendance, c.crusade_expense, ${METRIC_FIELDS.map((field) => `c.${field}`).join(", ")}, c.minister_name, c.venue,
          r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username`;

// One column per field a report can carry, in a readable order — attribution,
// the crusade, every outcome metric, then reporter contact.
const CRUSADE_EXPORT_COLUMNS = [
  { header: "Submitted at (UTC)", value: (row) => row.submitted_at },
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
];

// GET /api/crusades/export?format=csv|xlsx — all rows matching the current filters.
crusades.get("/export", requireAnyPageAccess(["crusades", "crusades/edit"]), wrap(async (req, res) => {
  const { clause, params } = crusadeFilters(req.query);
  const statement = db.prepare(`${CRUSADE_EXPORT_SELECT} ${CRUSADE_FROM} ${clause} ORDER BY ${ADMIN_REPORT_ORDER}`);
  const format = req.query.format === "xlsx" ? "xlsx" : "csv";

  // Exports are authenticated, point at live data, and must never reuse a browser
  // cache entry (including a previously interrupted header-only file).
  res.setHeader("Cache-Control", "no-store, private");

  // The report table is comparatively small, but some browser/proxy combinations
  // prematurely completed a chunked response after its headers. Build the report
  // file completely before responding so every displayed report is delivered.
  // Registration exports remain streamed because they can contain millions of rows.
  await sendExport(res, format, "crusade-reports", CRUSADE_EXPORT_COLUMNS, statement.all(params));
}));

// GET /api/crusades — paginated, filtered table backing the "All crusades" view.
crusades.get("/", requireAnyPageAccess(["crusades", "crusades/edit"]), wrap((req, res) => {
  const { clause, params } = crusadeFilters(req.query);
  const pageSize = Math.min(Math.max(parseInt(req.query.page_size, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  // Sorting: whitelisted column names only (never interpolate raw query input).
    const NUMERIC_SORT = new Set(["attendance", "crusade_expense", ...METRIC_FIELDS]);
  const TEXT_SORT = new Set(["submitted_at", "event_date", "event_name", "event_type", "format", "city", "country", "organization_type", "minister_name", "venue"]);
  const sortCol = NUMERIC_SORT.has(req.query.sort) || TEXT_SORT.has(req.query.sort) ? req.query.sort : "submitted_at";
  const dir = req.query.dir === "asc" ? "ASC" : "DESC";
  const sortExpression = sortCol === "submitted_at" ? "c.id" : `c.${sortCol}`;
  const orderBy = `${sortExpression}${TEXT_SORT.has(sortCol) && sortCol !== "submitted_at" ? " COLLATE NOCASE" : ""} ${dir}, c.id DESC`;

  // Full row, every uploaded field — this backs the "show everything received" table.
  const from = "FROM crusades c LEFT JOIN reports r ON r.id = c.report_id";
  const countKey = `crusades-count:${JSON.stringify(params)}:${clause}`;
  const total = cachedDashboardData(countKey, () => db.prepare(`SELECT COUNT(*) AS n ${from} ${clause}`).get(params).n, 60_000);
  const rows = db.prepare(
    `SELECT c.id, c.event_date, c.format, c.event_type, c.other_event_type, c.event_name, c.city, c.country,
            c.organization_type, c.zone, c.group_name, c.church_name, c.cell_name, c.network_name,
            c.created_at AS submitted_at, c.attendance, c.crusade_expense, ${METRIC_FIELDS.map((field) => `c.${field}`).join(", ")}, c.minister_name, c.venue,
            r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username
     ${from} ${clause} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  res.json({ rows, total, page, page_size: pageSize, filter_options: crusadeFilterOptions() });
}));

crusades.delete("/:id", requireSuperAdmin, wrap((req, res) => {
  res.json(deleteCrusadeReport(req.params.id));
}));

// ---- Super-admin edit: full crusade + report fields ---------------------------

const CRUSADE_EDIT_COLS = [
  "format", "event_type", "other_event_type", "event_name", "city", "city_place_id",
  "country", "event_date", "attendance", "crusade_expense", "minister_name", "venue",
  "organization_type", "zone", "group_name", "church_name", "cell_name", "network_name",
  ...METRIC_FIELDS,
];
const REPORT_EDIT_COLS = [
  "contact_name", "contact_email", "phone_country_code", "phone_number", "kingschat_username",
  "highlights", "media_links", "photo_links", "video_links",
];

// GET /api/crusades/:id/edit — full crusade + report data for the edit form.
crusades.get("/:id/edit", requirePageAccess("crusades/edit"), wrap((req, res) => {
  const row = db.prepare(`
    SELECT c.*, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number,
           r.kingschat_username, r.highlights, r.media_links, r.photo_links, r.video_links, r.id AS report_id
    FROM crusades c LEFT JOIN reports r ON r.id = c.report_id WHERE c.id = ?
  `).get(req.params.id);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Crusade not found.");
  row.photos = row.report_id ? listReportPhotos(row.report_id) : [];
  res.json(row);
}));

// PUT /api/crusades/:id — assigned report editors update crusade/report fields and add photos.
crusades.put("/:id", requirePageAccess("crusades/edit"), withReportPhotoUpload(wrap((req, res) => {
  const files = req.files || [];
  const existing = db.prepare("SELECT id, report_id FROM crusades WHERE id = ?").get(req.params.id);
  if (!existing) {
    removeUploadedFiles(files);
    throw new ApiError(404, "NOT_FOUND", "Crusade not found.");
  }
  if (files.length && !existing.report_id) {
    removeUploadedFiles(files);
    throw new ApiError(409, "REPORT_REQUIRED", "This crusade does not have a report record for photo uploads.");
  }

  let body;
  try {
    body = parseReportPayload(req);
  } catch (error) {
    removeUploadedFiles(files);
    throw error;
  }
  if ("photo_links" in body || "video_links" in body) {
    body.media_links = composeMediaLinks(body.photo_links, body.video_links);
  }
  const crusadeSet = [];
  const crusadeVals = [];
  for (const col of CRUSADE_EDIT_COLS) {
    if (col in body) {
      crusadeSet.push(`${col} = ?`);
      crusadeVals.push(body[col]);
    }
  }
  const reportSet = [];
  const reportVals = [];
  for (const col of REPORT_EDIT_COLS) {
    if (col in body) {
      reportSet.push(`${col} = ?`);
      reportVals.push(body[col]);
    }
  }

  const update = db.transaction(() => {
    if (crusadeSet.length) {
      crusadeVals.push(req.params.id);
      db.prepare(`UPDATE crusades SET ${crusadeSet.join(", ")} WHERE id = ?`).run(...crusadeVals);
    }
    if (reportSet.length && existing.report_id) {
      reportVals.push(existing.report_id);
      db.prepare(`UPDATE reports SET ${reportSet.join(", ")} WHERE id = ?`).run(...reportVals);
    }
    if (files.length) saveReportPhotos(existing.report_id, files);
  });
  try {
    update();
  } catch (error) {
    removeUploadedFiles(files);
    throw error;
  }

  const updated = db.prepare(`
    SELECT c.*, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number,
           r.kingschat_username, r.highlights, r.media_links, r.photo_links, r.video_links, r.id AS report_id
    FROM crusades c LEFT JOIN reports r ON r.id = c.report_id WHERE c.id = ?
  `).get(req.params.id);
  updated.photos = updated.report_id ? listReportPhotos(updated.report_id) : [];
  res.json(updated);
})));
