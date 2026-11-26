import { Router } from "express";
import { db, METRIC_FIELDS } from "../db.js";
import { portalCrusadeReportSchema, reportSchema } from "../validation.js";
import { wrap, ApiError } from "../logger.js";
import { requireAnyPageAccess, requireExternalOrPageAccess, requirePageAccess } from "../auth.js";
import { backfillCityCoords } from "./places.js";
import { ensureReportingOpen, shouldProtectAgainstDuplicateReports } from "../appSettings.js";
import { applyPortalScope } from "../portalScope.js";
import { DEFAULT_CAMPAIGN, assertCampaign, campaignEventDateError } from "../campaigns.js";
import { cachedDashboardData } from "../dashboardCache.js";
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
const publicDatabaseRow = (row) => {
  if (!row) return row;
  const { campaign: _campaign, ...data } = row;
  return data;
};

const insertReportStmt = db.prepare(`
  INSERT INTO reports (campaign, organization_type, zone, group_name, church_name, cell_name, network_name, network_type, country,
    contact_name, contact_email, phone_country_code, phone_number, kingschat_username, highlights, media_links, photo_links, video_links)
  VALUES (@campaign, @organization_type, @zone, @group_name, @church_name, @cell_name, @network_name, @network_type, @country,
    @contact_name, @contact_email, @phone_country_code, @phone_number, @kingschat_username, @highlights, @media_links, @photo_links, @video_links)
`);

const CRUSADE_COLS = [
  "campaign", "report_id", "organization_type", "zone", "group_name", "church_name", "cell_name", "network_name", "country",
  "format", "event_type", "other_event_type", "event_name", "city", "city_place_id", "event_date", "attendance", "crusade_expense",
  ...METRIC_FIELDS, "minister_name", "venue", "photo_links", "video_links", "registration_item_id",
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

const MEDIA_PAGE_KEY = "dashboard/media-reports";
const MEDIA_REVIEW_STATUSES = new Set(["new", "reviewed", "follow_up"]);
const HAS_REPORT_MEDIA_SQL = `(
  EXISTS (SELECT 1 FROM report_photos media_photo WHERE media_photo.report_id = r.id)
  OR TRIM(COALESCE(r.photo_links, '')) <> ''
  OR TRIM(COALESCE(r.video_links, '')) <> ''
  OR TRIM(COALESCE(r.media_links, '')) <> ''
)`;

export function mediaReportRequest(campaignOrQuery = {}, maybeQuery) {
  const campaign = maybeQuery === undefined ? DEFAULT_CAMPAIGN : assertCampaign(campaignOrQuery);
  const query = maybeQuery === undefined ? campaignOrQuery : maybeQuery;
  const where = ["r.campaign = @campaign", HAS_REPORT_MEDIA_SQL];
  const params = { campaign };
  const crusadeWhere = [];
  const exactReportFilters = [["zone", "r.zone"], ["network_name", "r.network_name"]];
  for (const [key, column] of exactReportFilters) {
    const value = String(query[key] || "").trim();
    if (!value) continue;
    where.push(`${column} = @${key} COLLATE NOCASE`);
    params[key] = value;
  }
  for (const [key, column] of [["event_type", "c.event_type"], ["format", "c.format"], ["country", "c.country"], ["city", "c.city"]]) {
    const value = String(query[key] || "").trim();
    if (!value) continue;
    crusadeWhere.push(`${column} = @${key} COLLATE NOCASE`);
    params[key] = value;
  }
  if (query.date_from) { crusadeWhere.push("c.event_date >= @date_from"); params.date_from = String(query.date_from); }
  if (query.date_to) { crusadeWhere.push("c.event_date <= @date_to"); params.date_to = String(query.date_to); }
  if (crusadeWhere.length) {
    where.push(`EXISTS (SELECT 1 FROM crusades c WHERE c.report_id = r.id AND c.campaign = @campaign AND ${crusadeWhere.join(" AND ")})`);
  }

  const reviewStatus = String(query.review_status || "").trim();
  if (MEDIA_REVIEW_STATUSES.has(reviewStatus)) {
    where.push("COALESCE(rv.status, 'new') = @review_status");
    params.review_status = reviewStatus;
  }
  const mediaType = String(query.media_type || "").trim();
  if (mediaType === "uploaded") where.push("EXISTS (SELECT 1 FROM report_photos p2 WHERE p2.report_id = r.id)");
  if (mediaType === "photos") where.push("(EXISTS (SELECT 1 FROM report_photos p2 WHERE p2.report_id = r.id) OR TRIM(COALESCE(r.photo_links, '')) <> '')");
  if (mediaType === "videos") where.push("TRIM(COALESCE(r.video_links, '')) <> ''");

  const q = String(query.q || "").trim();
  if (q) {
    params.q = `%${q}%`;
    where.push(`(
      CAST(r.id AS TEXT) LIKE @q OR r.zone LIKE @q OR r.group_name LIKE @q OR r.church_name LIKE @q
      OR r.cell_name LIKE @q OR r.network_name LIKE @q OR r.country LIKE @q OR r.highlights LIKE @q
      OR EXISTS (SELECT 1 FROM crusades search_crusade WHERE search_crusade.report_id = r.id AND search_crusade.campaign = @campaign AND (
        search_crusade.event_name LIKE @q OR search_crusade.city LIKE @q OR search_crusade.country LIKE @q
        OR search_crusade.venue LIKE @q OR search_crusade.minister_name LIKE @q
      ))
    )`);
  }
  return { clause: `WHERE ${where.join(" AND ")}`, params };
}

// Submit-time duplicate guard. Mirrors the import parser: a crusade is a
// duplicate when its date + name + country + city already exist in the fact
// table or repeat inside this same payload. Checked inside the transaction so
// double-clicks / double-submits can never insert the same crusade twice —
// the duplicates are skipped and the rest is submitted.
const alreadyReportedStmt = db.prepare(
  `SELECT 1 FROM crusades
   WHERE campaign = @campaign AND event_date = @event_date AND lower(event_name) = lower(@event_name)
     AND lower(coalesce(country, '')) = lower(@country) AND lower(coalesce(city, '')) = lower(@city)
   LIMIT 1`
);

export const insertReport = db.transaction((d) => {
  const campaign = assertCampaign(d.campaign);
  const dateError = campaignEventDateError(campaign, d.crusades.map((crusade) => crusade.event_date));
  if (dateError) throw new ApiError(422, "CAMPAIGN_DATE", dateError);
  // Country is per-crusade now; the report row keeps the first crusade's country
  // as its primary (the column is NOT NULL and drives report-level grouping).
  const reportCountry = d.country || d.crusades[0]?.country || "";
  const media = normalizeMediaFields(d);
  const reportId = insertReportStmt.run({
    campaign,
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

  let skippedDuplicates = 0;
  const seenInPayload = new Set();
  for (const c of d.crusades) {
    // Rows linked to a registration are uniqueness-guarded by the unique
    // registration_item_id index — never drop them on a name/date heuristic.
    const key = `${c.event_date}|${String(c.event_name || "").toLowerCase()}|${String(c.country || "").toLowerCase()}|${String(c.city || "").toLowerCase()}`;
    const duplicateProtectionEnabled = shouldProtectAgainstDuplicateReports(campaign, c.spreadsheet_imported ? "spreadsheet" : "manual");
    if (duplicateProtectionEnabled && !c.registration_item_id && c.event_name && c.event_date) {
      if (seenInPayload.has(key) || alreadyReportedStmt.get({
        campaign, event_date: c.event_date, event_name: c.event_name, country: c.country || "", city: c.city || "",
      })) {
        skippedDuplicates += 1;
        continue;
      }
      seenInPayload.add(key);
    } else if (duplicateProtectionEnabled && seenInPayload.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    const row = {
      campaign,
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
      photo_links: c.photo_links || null,
      video_links: c.video_links || null,
      registration_item_id: c.registration_item_id || null,
    };
    for (const m of METRIC_FIELDS) row[m] = c[m] ?? 0;
    insertCrusadeStmt.run(row);
  }
  d.skippedDuplicates = skippedDuplicates;
  return reportId;
});

export function submitRegisteredCrusadeReport(item, body, files = []) {
  const parsed = portalCrusadeReportSchema.safeParse(body);
  if (!parsed.success) {
    removeUploadedFiles(files);
    throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid report details.");
  }
  if (db.prepare("SELECT 1 FROM crusades WHERE registration_item_id = ? AND campaign = ?").get(item.id, item.campaign)) {
    removeUploadedFiles(files);
    throw new ApiError(409, "ALREADY_REPORTED", "A report has already been submitted for this crusade.");
  }

  let reportId;
  try {
    // A report belongs to the campaign of the crusade it reports on, whichever
    // host it was submitted through.
    reportId = insertReport({
      campaign: item.campaign,
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
    salvation AS reported_salvation FROM crusades WHERE registration_item_id = ? AND campaign = ?`).get(item.id, item.campaign);
  backfillCityCoords().catch(() => {});
  return { ...report, report_id: reportId, photos: listReportPhotos(reportId) };
}

reports.post("/", withReportPhotoUpload(wrap((req, res) => {
  ensureReportingOpen(req.campaign);
  const files = req.files || [];
  let payload;
  try {
    const body = parseReportPayload(req);
    payload = applyPortalScope(body, String(body?.portal_token || req.body?.portal_token || ""), req.campaign);
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
  let skippedDuplicates;
  try {
    const report = { ...parsed.data, campaign: req.campaign };
    id = insertReport(report);
    skippedDuplicates = report.skippedDuplicates || 0;
    saveReportPhotos(id, files);
  } catch (error) {
    removeUploadedFiles(files);
    throw error;
  }
  backfillCityCoords().catch(() => {}); // fire-and-forget; map fills in shortly after submit
  res.status(201).json({ id, photos: listReportPhotos(id), skipped_duplicates: skippedDuplicates });
})));

reports.get("/", requireExternalOrPageAccess(["crusades", "crusades/edit"]), wrap((req, res) => {
  if (req.externalApi) {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const cursor = Math.max(parseInt(req.query.cursor, 10) || 0, 0);
    const rows = db.prepare(`SELECT id, created_at, organization_type, zone, group_name, church_name, cell_name,
      network_name, network_type, country, highlights, media_links, photo_links, video_links
      FROM reports WHERE campaign = @campaign AND (@cursor = 0 OR id < @cursor) ORDER BY id DESC LIMIT @limit_plus_one`)
      .all({ campaign: req.campaign, cursor, limit_plus_one: limit + 1 });
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const ids = pageRows.map((row) => row.id);
    const crusadesByReport = new Map(ids.map((id) => [id, []]));
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(", ");
      for (const crusade of db.prepare(`SELECT * FROM crusades WHERE campaign = ? AND report_id IN (${placeholders}) ORDER BY id DESC`).all(req.campaign, ...ids)) {
        crusadesByReport.get(crusade.report_id).push(publicDatabaseRow(crusade));
      }
    }
    return res.json({
      data: pageRows.map((row) => ({ ...row, crusades: crusadesByReport.get(row.id) || [] })),
      meta: { limit, has_more: hasMore, next_cursor: hasMore ? pageRows.at(-1)?.id || null : null },
    });
  }
  const rows = db.prepare("SELECT * FROM reports WHERE campaign = ? ORDER BY created_at DESC LIMIT 500").all(req.campaign);
  const crus = db.prepare("SELECT * FROM crusades WHERE report_id = ? AND campaign = ?");
  res.json(rows.map((r) => ({ ...publicDatabaseRow(r), crusades: crus.all(r.id, req.campaign).map(publicDatabaseRow), photos: listReportPhotos(r.id) })));
}));

// Media review is report-based because uploaded files and external links belong
// to the report submission. Crusade rows are returned separately so old reports
// containing more than one crusade remain represented accurately.
reports.get("/media", requirePageAccess(MEDIA_PAGE_KEY), wrap((req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.page_size, 10) || 30, 1), 100);
  const { clause, params } = mediaReportRequest(req.campaign, req.query);
  const total = db.prepare(`
    SELECT COUNT(*) AS count FROM reports r
    LEFT JOIN report_media_reviews rv ON rv.report_id = r.id
    ${clause}
  `).get(params).count;
  const rows = db.prepare(`
    SELECT r.id, r.created_at, r.organization_type, r.zone, r.group_name, r.church_name, r.cell_name,
           r.network_name, r.country, r.highlights, r.photo_links, r.video_links, r.media_links,
           COALESCE(rv.status, 'new') AS review_status, rv.reviewed_at,
           (SELECT COUNT(*) FROM report_photos p WHERE p.report_id = r.id) AS photo_count,
           (SELECT COUNT(*) FROM crusades count_crusade WHERE count_crusade.report_id = r.id AND count_crusade.campaign = @campaign) AS crusade_count
    FROM reports r
    LEFT JOIN report_media_reviews rv ON rv.report_id = r.id
    ${clause}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  const ids = rows.map((row) => row.id);
  const crusadesByReport = new Map(ids.map((id) => [id, []]));
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(", ");
    for (const crusade of db.prepare(`
      SELECT id, report_id, event_name, event_type, other_event_type, format, event_date, city, country, venue, minister_name
      FROM crusades WHERE campaign = ? AND report_id IN (${placeholders}) ORDER BY event_date DESC, id DESC
    `).all(req.campaign, ...ids)) crusadesByReport.get(crusade.report_id)?.push(crusade);
  }

  const filterOptions = cachedDashboardData(`media-report-filter-options:${req.campaign}`, () => {
    const optionRows = (column, source = "reports r") => db.prepare(`
      SELECT DISTINCT TRIM(${column}) AS value FROM ${source}
      WHERE r.campaign = @campaign AND TRIM(COALESCE(${column}, '')) <> '' ORDER BY value COLLATE NOCASE LIMIT 500
    `).all({ campaign: req.campaign }).map((row) => row.value);
    return {
      event_type: optionRows("c.event_type", "crusades c JOIN reports r ON r.id = c.report_id"),
      zone: optionRows("r.zone"),
      network_name: optionRows("r.network_name"),
      country: optionRows("c.country", "crusades c JOIN reports r ON r.id = c.report_id"),
      city: optionRows("c.city", "crusades c JOIN reports r ON r.id = c.report_id"),
    };
  }, 300_000);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    rows: rows.map((row) => ({ ...row, crusades: crusadesByReport.get(row.id) || [] })),
    total,
    page,
    page_size: pageSize,
    filter_options: filterOptions,
  });
}));

reports.get("/media/:id", requirePageAccess(MEDIA_PAGE_KEY), wrap((req, res) => {
  const row = db.prepare(`
    SELECT r.id, r.created_at, r.organization_type, r.zone, r.group_name, r.church_name, r.cell_name,
           r.network_name, r.country, r.highlights, r.photo_links, r.video_links, r.media_links,
           COALESCE(rv.status, 'new') AS review_status, rv.reviewed_at
    FROM reports r LEFT JOIN report_media_reviews rv ON rv.report_id = r.id
    WHERE r.id = ? AND r.campaign = ?
  `).get(req.params.id, req.campaign);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Report not found.");
  row.crusades = db.prepare(`SELECT id, report_id, event_name, event_type, other_event_type, format, event_date,
    city, country, venue, minister_name FROM crusades WHERE report_id = ? AND campaign = ? ORDER BY event_date DESC, id DESC`).all(row.id, req.campaign);
  row.photos = listReportPhotos(row.id);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(row);
}));

reports.patch("/media/:id/review", requirePageAccess(MEDIA_PAGE_KEY), wrap((req, res) => {
  const status = String(req.body?.status || "");
  if (!MEDIA_REVIEW_STATUSES.has(status)) throw new ApiError(422, "VALIDATION", "Select a valid review status.");
  if (!db.prepare("SELECT 1 FROM reports WHERE id = ? AND campaign = ?").get(req.params.id, req.campaign)) {
    throw new ApiError(404, "NOT_FOUND", "Report not found.");
  }
  db.prepare(`
    INSERT INTO report_media_reviews (report_id, status, reviewed_at, reviewed_by)
    VALUES (@report_id, @status, datetime('now'), @reviewed_by)
    ON CONFLICT(report_id) DO UPDATE SET status = excluded.status,
      reviewed_at = excluded.reviewed_at, reviewed_by = excluded.reviewed_by
  `).run({ report_id: req.params.id, status, reviewed_by: req.admin?.username || null });
  res.json({ report_id: Number(req.params.id), status });
}));

// Authenticated photo download for admins reviewing submitted reports.
reports.get("/photo-file/:storedName", requireAnyPageAccess(["crusades", "crusades/edit", MEDIA_PAGE_KEY]), wrap((req, res) => {
  const { row, stream } = resolveReportPhotoPath(req.params.storedName);
  if (!db.prepare("SELECT 1 FROM reports WHERE id = ? AND campaign = ?").get(row.report_id, req.campaign)) {
    stream.destroy();
    throw new ApiError(404, "NOT_FOUND", "Photo not found.");
  }
  res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(row.original_name || row.stored_name)}"`);
  res.setHeader("Cache-Control", "private, max-age=86400");
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}));

reports.get("/:id", requireAnyPageAccess(["crusades", "crusades/edit"]), wrap((req, res) => {
  const row = db.prepare("SELECT * FROM reports WHERE id = ? AND campaign = ?").get(req.params.id, req.campaign);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Report not found");
  row.crusades = db.prepare("SELECT * FROM crusades WHERE report_id = ? AND campaign = ?").all(row.id, req.campaign);
  row.photos = listReportPhotos(row.id);
  res.json({ ...publicDatabaseRow(row), crusades: row.crusades.map(publicDatabaseRow) });
}));
