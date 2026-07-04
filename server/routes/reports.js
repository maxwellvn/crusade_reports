import { Router } from "express";
import { db, METRIC_FIELDS } from "../db.js";
import { reportSchema } from "../validation.js";
import { wrap, ApiError } from "../logger.js";
import { backfillCityCoords } from "./places.js";

export const reports = Router();

const insertReportStmt = db.prepare(`
  INSERT INTO reports (organization_type, zone, group_name, church_name, network_name, network_type, country, highlights, media_links)
  VALUES (@organization_type, @zone, @group_name, @church_name, @network_name, @network_type, @country, @highlights, @media_links)
`);

const CRUSADE_COLS = [
  "report_id", "organization_type", "zone", "group_name", "church_name", "network_name", "country",
  "format", "event_type", "other_event_type", "event_name", "city", "city_place_id", "event_date", "attendance",
  ...METRIC_FIELDS, "minister_name", "venue",
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
    network_name: d.network_name || null,
    network_type: d.network_type || null,
    country: d.country,
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
    };
    for (const m of METRIC_FIELDS) row[m] = c[m] ?? 0;
    insertCrusadeStmt.run(row);
  }
  return reportId;
});

reports.post("/", wrap((req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid data");
  const id = insertReport(parsed.data);
  backfillCityCoords().catch(() => {}); // fire-and-forget; map fills in shortly after submit
  res.status(201).json({ id });
}));

reports.get("/", wrap((_req, res) => {
  const rows = db.prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT 500").all();
  const crus = db.prepare("SELECT * FROM crusades WHERE report_id = ?");
  res.json(rows.map((r) => ({ ...r, crusades: crus.all(r.id) })));
}));

reports.get("/:id", wrap((req, res) => {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Report not found");
  row.crusades = db.prepare("SELECT * FROM crusades WHERE report_id = ?").all(row.id);
  res.json(row);
}));
