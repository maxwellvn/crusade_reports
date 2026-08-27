import { Router } from "express";
import { db, METRIC_FIELDS } from "../db.js";
import { portalCrusadeReportSchema, reportSchema } from "../validation.js";
import { wrap, ApiError } from "../logger.js";
import { requireAnyPageAccess, requireExternalOrPageAccess } from "../auth.js";
import { backfillCityCoords } from "./places.js";
import { ensureReportingOpen } from "../appSettings.js";
import { applyPortalScope } from "../portalScope.js";
import {
  composeMediaLinks,
  listReportPhotos,
  parseReportPayload,
  removeUploadedFiles,
  resolveReportPhotoPath,
  saveReportPhotos,
  withReportPhotoUpload,
} from "../reportMedia.js";

export const reports = Router();

const insertReportStmt = db.prepare(`
  INSERT INTO reports (organization_type, zone, group_name, church_name, cell_name, network_name, network_type, country,
    contact_name, contact_email, phone_country_code, phone_number, kingschat_username, highlights, media_links, photo_links, video_links)
  VALUES (@organization_type, @zone, @group_name, @church_name, @cell_name, @network_name, @network_type, @country,
    @contact_name, @contact_email, @phone_country_code, @phone_number, @kingschat_username, @highlights, @media_links, @photo_links, @video_links)
`);

const CRUSADE_COLS = [
  "report_id", "organization_type", "zone", "group_name", "church_name", "cell_name", "network_name", "country",
  "format", "event_type", "other_event_type", "event_name", "city", "city_place_id", "event_date", "attendance", "crusade_expense",
  ...METRIC_FIELDS, "minister_name", "venue", "registration_item_id",
];
const insertCrusadeStmt = db.prepare(
  `INSERT INTO crusades (${CRUSADE_COLS.join(", ")}) VALUES (${CRUSADE_COLS.map((c) => "@" + c).join(", ")})`
);

function normalizeMediaFields(data) {
  const photo_links = String(data.photo_links || "").trim();
  const video_links = String(data.video_links || "").trim();
  const legacy = String(data.media_links || "").trim();
  // Older clients only send media_links — treat that as photo links when the new fields are empty.
  const photos = photo_links || (!video_links ? legacy : "");
  const videos = video_links;
  return {
    photo_links: photos || null,
    video_links: videos || null,
    media_links: composeMediaLinks(photos, videos) || legacy || null,
  };
}

// One transaction: the report row + one fact row per crusade. Attribution is copied
// onto each crusade so dashboards GROUP BY any hierarchy level. Shared by form + import.
export const insertReport = db.transaction((d) => {
  // Country is per-crusade now; the report row keeps the first crusade's country
  // as its primary (the column is NOT NULL and drives report-level grouping).
  const reportCountry = d.country || d.crusades[0]?.country || "";
  const media = normalizeMediaFields(d);
  const reportId = insertReportStmt.run({
    organization_type: d.organization_type,
    zone: d.zone || null,
    group_name: d.group_name || null,
    church_name: d.church_name || null,
    cell_name: d.cell_name || null,
    network_name: d.network_name || null,
    network_type: d.network_type || null,
    country: reportCountry,
    contact_name: d.contact_name,
    contact_email: d.contact_email,
    phone_country_code: d.phone_country_code,
    phone_number: d.phone_number,
    kingschat_username: d.kingschat_username,
    highlights: d.highlights || null,
    media_links: media.media_links,
    photo_links: media.photo_links,
    video_links: media.video_links,
  }).lastInsertRowid;

  for (const c of d.crusades) {
    const row = {
      report_id: reportId,
      organization_type: d.organization_type,
      zone: d.zone || null,
      group_name: d.group_name || null,
      church_name: d.church_name || null,
      cell_name: d.cell_name || null,
      network_name: d.network_name || null,
      country: c.country || reportCountry,
      format: c.format,
      event_type: c.event_type,
      other_event_type: c.other_event_type || null,
      event_name: c.event_name || null,
      city: c.city,
      city_place_id: c.city_place_id || null,
      event_date: c.event_date,
      attendance: c.attendance,
      crusade_expense: c.crusade_expense,
      minister_name: c.minister_name || null,
      venue: c.venue || null,
      registration_item_id: c.registration_item_id || null,
    };
    for (const m of METRIC_FIELDS) row[m] = c[m] ?? 0;
    insertCrusadeStmt.run(row);
  }
  return reportId;
});

export function submitRegisteredCrusadeReport(item, body, files = []) {
  const parsed = portalCrusadeReportSchema.safeParse(body);
  if (!parsed.success) {
    removeUploadedFiles(files);
    throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid report details.");
  }
  if (db.prepare("SELECT 1 FROM crusades WHERE registration_item_id = ?").get(item.id)) {
    removeUploadedFiles(files);
    throw new ApiError(409, "ALREADY_REPORTED", "A report has already been submitted for this crusade.");
  }

  let reportId;
  try {
    reportId = insertReport({
      organization_type: item.organization_type,
      zone: item.zone || "",
      group_name: item.group_name || "",
      church_name: item.church_name || "",
      cell_name: item.cell_name || "",
      network_name: item.network_name || "",
      country: item.country,
      contact_name: item.contact_name,
      contact_email: item.contact_email,
      phone_country_code: item.phone_country_code,
      phone_number: item.phone_number,
      kingschat_username: item.kingschat_username || "",
      highlights: parsed.data.highlights,
      photo_links: parsed.data.photo_links,
      video_links: parsed.data.video_links,
      media_links: parsed.data.media_links,
      crusades: [{ ...parsed.data.crusade, registration_item_id: item.id }],
    });
    saveReportPhotos(reportId, files);
  } catch (error) {
    removeUploadedFiles(files);
    throw error;
  }

  const report = db.prepare(`SELECT id AS report_crusade_id, report_id, created_at AS reported_at,
    attendance AS reported_attendance, crusade_expense AS reported_expense, online_participation AS reported_online_participation,
    salvation AS reported_salvation FROM crusades WHERE registration_item_id = ?`).get(item.id);
  backfillCityCoords().catch(() => {});
  return { ...report, report_id: reportId, photos: listReportPhotos(reportId) };
}

reports.post("/", withReportPhotoUpload(wrap((req, res) => {
  ensureReportingOpen();
  const files = req.files || [];
  let payload;
  try {
    const body = parseReportPayload(req);
    payload = applyPortalScope(body, String(body?.portal_token || req.body?.portal_token || ""));
  } catch (error) {
    removeUploadedFiles(files);
    throw error;
  }
  const parsed = reportSchema.safeParse(payload);
  if (!parsed.success) {
    removeUploadedFiles(files);
    throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid data");
  }
  let id;
  try {
    id = insertReport(parsed.data);
    saveReportPhotos(id, files);
  } catch (error) {
    removeUploadedFiles(files);
    throw error;
  }
  backfillCityCoords().catch(() => {}); // fire-and-forget; map fills in shortly after submit
  res.status(201).json({ id, photos: listReportPhotos(id) });
})));

reports.get("/", requireExternalOrPageAccess(["crusades", "crusades/edit"]), wrap((req, res) => {
  if (req.externalApi) {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const cursor = Math.max(parseInt(req.query.cursor, 10) || 0, 0);
    const rows = db.prepare(`SELECT id, created_at, organization_type, zone, group_name, church_name, cell_name,
      network_name, network_type, country, highlights, media_links, photo_links, video_links
      FROM reports WHERE (@cursor = 0 OR id < @cursor) ORDER BY id DESC LIMIT @limit_plus_one`)
      .all({ cursor, limit_plus_one: limit + 1 });
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const ids = pageRows.map((row) => row.id);
    const crusadesByReport = new Map(ids.map((id) => [id, []]));
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(", ");
      for (const crusade of db.prepare(`SELECT * FROM crusades WHERE report_id IN (${placeholders}) ORDER BY id DESC`).all(...ids)) {
        crusadesByReport.get(crusade.report_id).push(crusade);
      }
    }
    return res.json({
      data: pageRows.map((row) => ({ ...row, crusades: crusadesByReport.get(row.id) || [] })),
      meta: { limit, has_more: hasMore, next_cursor: hasMore ? pageRows.at(-1)?.id || null : null },
    });
  }
  const rows = db.prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT 500").all();
  const crus = db.prepare("SELECT * FROM crusades WHERE report_id = ?");
  res.json(rows.map((r) => ({ ...r, crusades: crus.all(r.id), photos: listReportPhotos(r.id) })));
}));

// Authenticated photo download for admins reviewing submitted reports.
reports.get("/photo-file/:storedName", requireAnyPageAccess(["crusades", "crusades/edit"]), wrap((req, res) => {
  const { row, stream } = resolveReportPhotoPath(req.params.storedName);
  res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(row.original_name || row.stored_name)}"`);
  res.setHeader("Cache-Control", "private, max-age=86400");
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}));

reports.get("/:id", requireAnyPageAccess(["crusades", "crusades/edit"]), wrap((req, res) => {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Report not found");
  row.crusades = db.prepare("SELECT * FROM crusades WHERE report_id = ?").all(row.id);
  row.photos = listReportPhotos(row.id);
  res.json(row);
}));
