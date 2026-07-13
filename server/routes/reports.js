import { Router } from "express";
import { db, METRIC_FIELDS } from "../db.js";
import { portalCrusadeReportSchema, reportSchema } from "../validation.js";
import { wrap, ApiError } from "../logger.js";
import { requireAdmin } from "../auth.js";
import { backfillCityCoords } from "./places.js";
import { ensureReportingOpen } from "../appSettings.js";
import { applyPortalScope } from "../portalScope.js";

export const reports = Router();

const insertReportStmt = db.prepare(`
  INSERT INTO reports (organization_type, zone, group_name, church_name, cell_name, network_name, network_type, country,
    contact_name, contact_email, phone_country_code, phone_number, kingschat_username, highlights, media_links)
  VALUES (@organization_type, @zone, @group_name, @church_name, @cell_name, @network_name, @network_type, @country,
    @contact_name, @contact_email, @phone_country_code, @phone_number, @kingschat_username, @highlights, @media_links)
`);

const CRUSADE_COLS = [
  "report_id", "organization_type", "zone", "group_name", "church_name", "cell_name", "network_name", "country",
  "format", "event_type", "other_event_type", "event_name", "city", "city_place_id", "event_date", "attendance",
  ...METRIC_FIELDS, "minister_name", "venue", "registration_item_id",
];
const insertCrusadeStmt = db.prepare(
  `INSERT INTO crusades (${CRUSADE_COLS.join(", ")}) VALUES (${CRUSADE_COLS.map((c) => "@" + c).join(", ")})`
);

// One transaction: the report row + one fact row per crusade. Attribution is copied
// onto each crusade so dashboards GROUP BY any hierarchy level. Shared by form + import.
export const insertReport = db.transaction((d) => {
  const reportId = insertReportStmt.run({
    organization_type: d.organization_type,
    zone: d.zone || null,
    group_name: d.group_name || null,
    church_name: d.church_name || null,
    cell_name: d.cell_name || null,
    network_name: d.network_name || null,
    network_type: d.network_type || null,
    country: d.country,
    contact_name: d.contact_name,
    contact_email: d.contact_email,
    phone_country_code: d.phone_country_code,
    phone_number: d.phone_number,
    kingschat_username: d.kingschat_username,
    highlights: d.highlights || null,
    media_links: d.media_links || null,
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
      country: d.country,
      format: c.format,
      event_type: c.event_type,
      other_event_type: c.other_event_type || null,
      event_name: c.event_name || null,
      city: c.city,
      city_place_id: c.city_place_id || null,
      event_date: c.event_date,
      attendance: c.attendance,
      minister_name: c.minister_name || null,
      venue: c.venue || null,
      registration_item_id: c.registration_item_id || null,
    };
    for (const m of METRIC_FIELDS) row[m] = c[m] ?? 0;
    insertCrusadeStmt.run(row);
  }
  return reportId;
});

export function submitRegisteredCrusadeReport(item, body) {
  const parsed = portalCrusadeReportSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid report details.");
  if (db.prepare("SELECT 1 FROM crusades WHERE registration_item_id = ?").get(item.id)) {
    throw new ApiError(409, "ALREADY_REPORTED", "A report has already been submitted for this crusade.");
  }

  const reportId = insertReport({
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
    media_links: parsed.data.media_links,
    crusades: [{ ...parsed.data.crusade, registration_item_id: item.id }],
  });
  const report = db.prepare(`SELECT id AS report_crusade_id, report_id, created_at AS reported_at,
    attendance AS reported_attendance, online_participation AS reported_online_participation,
    salvation AS reported_salvation FROM crusades WHERE registration_item_id = ?`).get(item.id);
  backfillCityCoords().catch(() => {});
  return { ...report, report_id: reportId };
}

reports.post("/", wrap((req, res) => {
  ensureReportingOpen();
  const payload = applyPortalScope(req.body, String(req.body?.portal_token || ""));
  const parsed = reportSchema.safeParse(payload);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid data");
  const id = insertReport(parsed.data);
  backfillCityCoords().catch(() => {}); // fire-and-forget; map fills in shortly after submit
  res.status(201).json({ id });
}));

reports.get("/", requireAdmin, wrap((_req, res) => {
  const rows = db.prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT 500").all();
  const crus = db.prepare("SELECT * FROM crusades WHERE report_id = ?");
  res.json(rows.map((r) => ({ ...r, crusades: crus.all(r.id) })));
}));

reports.get("/:id", requireAdmin, wrap((req, res) => {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Report not found");
  row.crusades = db.prepare("SELECT * FROM crusades WHERE report_id = ?").all(row.id);
  res.json(row);
}));
