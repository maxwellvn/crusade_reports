import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { requireSuperAdmin } from "../auth.js";
import { COUNTRIES } from "./countries.js";
import { ApiError, wrap } from "../logger.js";
import { missionNationSelectionSchema } from "../validation.js";
import { loadZones } from "./zones.js";
import { sendExport } from "./exporter.js";

export const missionNations = Router();
const countryByCode = new Map(COUNTRIES.map((country) => [country.code, country]));
const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'mission_nation_selection_open'");
const isOpen = () => setting.get()?.value !== "0";

function catalogue() {
  const interest = new Map(db.prepare("SELECT mission_country_code, COUNT(*) AS count FROM mission_nation_selections GROUP BY mission_country_code").all()
    .map((row) => [row.mission_country_code, row.count]));
  return COUNTRIES.map((country) => ({
    ...country,
    interest_count: interest.get(country.code) || 0,
    minimum_crusades: 1000,
  }));
}

missionNations.get("/", wrap((_req, res) => {
  const nations = catalogue();
  const preferences = db.prepare("SELECT COUNT(*) AS count FROM mission_nation_selections").get().count;
  res.json({ nations, preferences, total: nations.length, selection_open: isOpen() });
}));

missionNations.post("/", wrap(async (req, res) => {
  if (!isOpen()) throw new ApiError(403, "SELECTION_CLOSED", "Mission nation selection is currently closed.");
  const parsed = missionNationSelectionSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(400, "VALIDATION", issue?.message || "Check the required fields.");
  }
  const data = parsed.data;
  const home = countryByCode.get(data.home_country_code);
  const mission = countryByCode.get(data.mission_country_code);
  if (!home || !mission) throw new ApiError(400, "INVALID_NATION", "Choose nations from the mission nation directory.");
  if (home.code === mission.code) throw new ApiError(400, "HOME_NATION", "Your zone cannot select its home nation.");
  const canonicalZone = (await loadZones()).find((row) => row.zone.toLowerCase() === data.zone_name.toLowerCase())?.zone;
  if (!canonicalZone) throw new ApiError(400, "INVALID_ZONE", "Choose a zone from the official zone directory.");

  const receiptCode = `MN-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  try {
    const result = db.prepare(`INSERT INTO mission_nation_selections
      (receipt_code, pastor_name, zone_name, home_country_code, home_country_name,
       mission_country_code, mission_country_name, contact_email, phone_country_code, phone_number, kingschat_username)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(receiptCode, data.pastor_name, canonicalZone, home.code, home.name, mission.code, mission.name,
        data.contact_email, data.phone_country_code, data.phone_number, data.kingschat_username.replace(/^@/, ""));
    const row = db.prepare("SELECT * FROM mission_nation_selections WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({
      receipt_code: row.receipt_code,
      pastor_name: row.pastor_name,
      zone_name: row.zone_name,
      home_nation: row.home_country_name,
      mission_nation: row.mission_country_name,
      minimum_crusades: 1000,
      submitted_at: row.created_at,
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      if (db.prepare("SELECT 1 FROM mission_nation_selections WHERE zone_name = ? COLLATE NOCASE").get(canonicalZone)) {
        throw new ApiError(409, "ZONE_ALREADY_SELECTED", "This zone has already selected a mission nation.");
      }
    }
    throw error;
  }
}));

const ADMIN_SORT_COLUMNS = {
  created_at: "created_at", mission_nation: "mission_country_name COLLATE NOCASE",
  assigned_nation: "assigned_country_name COLLATE NOCASE", home_nation: "home_country_name COLLATE NOCASE",
  zone: "zone_name COLLATE NOCASE", pastor: "pastor_name COLLATE NOCASE",
};

export function adminSelectionQuery(query) {
  const where = [];
  const params = {};
  const q = String(query.q || "").trim().slice(0, 100);
  if (q) {
    where.push(`(pastor_name LIKE @q OR zone_name LIKE @q OR mission_country_name LIKE @q OR assigned_country_name LIKE @q
      OR home_country_name LIKE @q OR contact_email LIKE @q OR kingschat_username LIKE @q OR receipt_code LIKE @q)`);
    params.q = `%${q}%`;
  }
  for (const [key, column] of [["mission_country", "mission_country_code"], ["assigned_country", "assigned_country_code"], ["home_country", "home_country_code"], ["zone", "zone_name"]]) {
    const value = String(query[key] || "").trim().slice(0, 200);
    if (value) { where.push(`${column} = @${key} COLLATE NOCASE`); params[key] = value; }
  }
  for (const [key, operator] of [["date_from", ">="], ["date_to", "<="]]) {
    const value = String(query[key] || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      where.push(`date(created_at) ${operator} @${key}`); params[key] = value;
    }
  }
  const sort = ADMIN_SORT_COLUMNS[query.sort] || ADMIN_SORT_COLUMNS.created_at;
  const direction = String(query.direction).toLowerCase() === "asc" ? "ASC" : "DESC";
  const sql = `SELECT * FROM mission_nation_selections ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${sort} ${direction}, id ${direction}`;
  return db.prepare(sql).all(params);
}

const exportColumns = [
  { header: "Receipt", value: (row) => row.receipt_code },
  { header: "Preferred Mission Nation", value: (row) => row.mission_country_name },
  { header: "Assigned Mission Nation", value: (row) => row.assigned_country_name || "Not assigned" },
  { header: "Zone", value: (row) => row.zone_name },
  { header: "Zonal Pastor", value: (row) => row.pastor_name },
  { header: "Zone Home Nation", value: (row) => row.home_country_name },
  { header: "Minimum Crusades", value: () => 1000 },
  { header: "Email", value: (row) => row.contact_email },
  { header: "Phone", value: (row) => `${row.phone_country_code} ${row.phone_number}` },
  { header: "KingsChat Username", value: (row) => `@${row.kingschat_username}` },
  { header: "Submitted At (UTC)", value: (row) => row.created_at },
];

missionNations.get("/admin/export", requireSuperAdmin, wrap(async (req, res) => {
  const format = req.query.format === "csv" ? "csv" : "xlsx";
  await sendExport(res, format, "mission-nation-selections", exportColumns, adminSelectionQuery(req.query));
}));

missionNations.get("/admin", requireSuperAdmin, wrap((req, res) => {
  const rows = adminSelectionQuery(req.query);
  const preferenceTotal = db.prepare("SELECT COUNT(*) AS count FROM mission_nation_selections").get().count;
  const finalizedTotal = db.prepare("SELECT COUNT(*) AS count FROM mission_nation_selections WHERE assigned_country_code IS NOT NULL").get().count;
  const zones = db.prepare("SELECT DISTINCT zone_name AS name FROM mission_nation_selections ORDER BY zone_name COLLATE NOCASE").all().map((row) => row.name);
  res.json({
    rows, filtered_total: rows.length, preference_total: preferenceTotal, finalized_total: finalizedTotal, selection_open: isOpen(), nation_total: COUNTRIES.length,
    filter_options: { nations: COUNTRIES, zones },
  });
}));

missionNations.put("/admin/:id/assignment", requireSuperAdmin, wrap((req, res) => {
  const row = db.prepare("SELECT * FROM mission_nation_selections WHERE id = ?").get(req.params.id);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Mission nation preference not found.");
  const code = String(req.body.country_code || "").trim().toUpperCase();
  const country = code ? countryByCode.get(code) : null;
  if (code && !country) throw new ApiError(400, "INVALID_NATION", "Choose a nation from the mission nation directory.");
  if (country?.code === row.home_country_code) throw new ApiError(400, "HOME_NATION", "This zone cannot be assigned its home nation.");
  db.prepare(`UPDATE mission_nation_selections SET assigned_country_code = ?, assigned_country_name = ?,
    assignment_updated_at = datetime('now'), assigned_by = ? WHERE id = ?`)
    .run(country?.code || null, country?.name || null, req.admin.username, row.id);
  res.json(db.prepare("SELECT * FROM mission_nation_selections WHERE id = ?").get(row.id));
}));

missionNations.put("/admin/settings", requireSuperAdmin, wrap((req, res) => {
  if (typeof req.body.selection_open !== "boolean") throw new ApiError(400, "VALIDATION", "selection_open must be true or false.");
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mission_nation_selection_open', ?)")
    .run(req.body.selection_open ? "1" : "0");
  res.json({ selection_open: isOpen() });
}));

missionNations.delete("/admin/:id", requireSuperAdmin, wrap((req, res) => {
  const result = db.prepare("DELETE FROM mission_nation_selections WHERE id = ?").run(req.params.id);
  if (!result.changes) throw new ApiError(404, "NOT_FOUND", "Mission nation selection not found.");
  res.status(204).end();
}));
