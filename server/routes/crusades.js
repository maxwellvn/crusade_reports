import { Router } from "express";
import { db, METRIC_FIELDS } from "../db.js";
import { wrap, ApiError } from "../logger.js";
import { requireAdmin, requireSuperAdmin } from "../auth.js";
import { sendExport } from "./exporter.js";
import { typeLabel, METRIC_LABELS, FORMAT_LABELS, ORG_TYPE_LABELS, phone } from "../labels.js";
import { deleteReportPhotos, listReportPhotos } from "../reportMedia.js";

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

// Exact-match filters (dropdown-driven); "city" is substring since it's free text.
const FILTER_COLS = ["organization_type", "zone", "group_name", "church_name", "cell_name", "network_name", "country", "event_type", "format"];

// Build the shared WHERE clause for the table and its export, so both apply the
// exact same filters and free-text search.
function crusadeFilters(query) {
  const where = [];
  const params = {};
  for (const col of FILTER_COLS) {
    const v = query[col];
    if (v) { where.push(`c.${col} = @${col}`); params[col] = String(v); }
  }
  if (query.city) { where.push("c.city LIKE @city"); params.city = `%${query.city}%`; }
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
          c.attendance, c.crusade_expense, ${METRIC_FIELDS.map((field) => `c.${field}`).join(", ")}, c.minister_name, c.venue,
          r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username`;

// One column per field a report can carry, in a readable order — attribution,
// the crusade, every outcome metric, then reporter contact.
const CRUSADE_EXPORT_COLUMNS = [
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
crusades.get("/export", requireAdmin, wrap(async (req, res) => {
  const { clause, params } = crusadeFilters(req.query);
  const rows = db.prepare(`${CRUSADE_EXPORT_SELECT} ${CRUSADE_FROM} ${clause} ORDER BY c.event_date DESC, c.id DESC`).all(params);
  await sendExport(res, req.query.format === "xlsx" ? "xlsx" : "csv", "crusade-reports", CRUSADE_EXPORT_COLUMNS, rows);
}));

// GET /api/crusades — paginated, filtered table backing the "All crusades" view.
crusades.get("/", requireAdmin, wrap((req, res) => {
  const { clause, params } = crusadeFilters(req.query);
  const pageSize = Math.min(Math.max(parseInt(req.query.page_size, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  // Sorting: whitelisted column names only (never interpolate raw query input).
    const NUMERIC_SORT = new Set(["attendance", "crusade_expense", ...METRIC_FIELDS]);
  const TEXT_SORT = new Set(["event_date", "event_name", "event_type", "format", "city", "country", "organization_type", "minister_name", "venue"]);
  const sortCol = NUMERIC_SORT.has(req.query.sort) || TEXT_SORT.has(req.query.sort) ? req.query.sort : "event_date";
  const dir = req.query.dir === "asc" ? "ASC" : "DESC";
  const orderBy = `c.${sortCol}${TEXT_SORT.has(sortCol) ? " COLLATE NOCASE" : ""} ${dir}, c.id DESC`;

  // Full row, every uploaded field — this backs the "show everything received" table.
  const from = "FROM crusades c LEFT JOIN reports r ON r.id = c.report_id";
  const total = db.prepare(`SELECT COUNT(*) AS n ${from} ${clause}`).get(params).n;
  const rows = db.prepare(
    `SELECT c.id, c.event_date, c.format, c.event_type, c.other_event_type, c.event_name, c.city, c.country,
            c.organization_type, c.zone, c.group_name, c.church_name, c.cell_name, c.network_name,
            c.attendance, c.crusade_expense, ${METRIC_FIELDS.map((field) => `c.${field}`).join(", ")}, c.minister_name, c.venue,
            r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username
     ${from} ${clause} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  res.json({ rows, total, page, page_size: pageSize });
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
crusades.get("/:id/edit", requireSuperAdmin, wrap((req, res) => {
  const row = db.prepare(`
    SELECT c.*, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number,
           r.kingschat_username, r.highlights, r.media_links, r.photo_links, r.video_links, r.id AS report_id
    FROM crusades c LEFT JOIN reports r ON r.id = c.report_id WHERE c.id = ?
  `).get(req.params.id);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Crusade not found.");
  row.photos = row.report_id ? listReportPhotos(row.report_id) : [];
  res.json(row);
}));

// PUT /api/crusades/:id — super admin updates all editable crusade + report fields.
crusades.put("/:id", requireSuperAdmin, wrap((req, res) => {
  const existing = db.prepare("SELECT id, report_id FROM crusades WHERE id = ?").get(req.params.id);
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Crusade not found.");

  const body = req.body || {};
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

  db.transaction(() => {
    if (crusadeSet.length) {
      crusadeVals.push(req.params.id);
      db.prepare(`UPDATE crusades SET ${crusadeSet.join(", ")} WHERE id = ?`).run(...crusadeVals);
    }
    if (reportSet.length && existing.report_id) {
      reportVals.push(existing.report_id);
      db.prepare(`UPDATE reports SET ${reportSet.join(", ")} WHERE id = ?`).run(...reportVals);
    }
  })();

  const updated = db.prepare(`
    SELECT c.*, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number,
           r.kingschat_username, r.highlights, r.media_links, r.photo_links, r.video_links, r.id AS report_id
    FROM crusades c LEFT JOIN reports r ON r.id = c.report_id WHERE c.id = ?
  `).get(req.params.id);
  updated.photos = updated.report_id ? listReportPhotos(updated.report_id) : [];
  res.json(updated);
}));
