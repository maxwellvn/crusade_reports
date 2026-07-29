import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { requireSuperAdmin } from "../auth.js";
import { ApiError, wrap } from "../logger.js";
import { mediaTrainingRegistrationSchema } from "../validation.js";
import { sendExport } from "./exporter.js";
import { loadZones } from "./zones.js";
import { COUNTRIES } from "./countries.js";

export const mediaTraining = Router();

export function mediaTrainingRows(query = {}) {
  const where = [];
  const params = {};
  const q = String(query.q || "").trim().slice(0, 100);
  if (q) {
    where.push(`(r.reference_code LIKE @q OR r.zone_name LIKE @q OR r.group_name LIKE @q OR r.church_name LIKE @q OR r.church_country_name LIKE @q OR r.church_city LIKE @q
      OR t.full_name LIKE @q OR t.email LIKE @q OR t.kingschat_username LIKE @q OR t.phone_number LIKE @q OR t.languages_spoken LIKE @q)`);
    params.q = `%${q}%`;
  }
  const role = String(query.role || "").trim().slice(0, 100);
  if (role) { where.push("t.role = @role COLLATE NOCASE"); params.role = role; }
  const zone = String(query.zone || "").trim().slice(0, 250);
  if (zone) { where.push("r.zone_name = @zone COLLATE NOCASE"); params.zone = zone; }
  const direction = String(query.direction).toLowerCase() === "asc" ? "ASC" : "DESC";
  const sort = { created_at: "r.created_at", zone: "r.zone_name COLLATE NOCASE", organization: "r.church_name COLLATE NOCASE", trainee: "t.full_name COLLATE NOCASE", role: "t.role COLLATE NOCASE" }[query.sort] || "r.created_at";
  return db.prepare(`SELECT r.id AS registration_id, r.reference_code, r.zone_name, r.group_name, r.church_name, r.church_country_code, r.church_country_name, r.church_city, r.church_city_place_id,
    CASE WHEN COALESCE(r.group_name, '') = '' AND COALESCE(r.church_name, '') = '' THEN '—'
      WHEN COALESCE(r.group_name, '') = '' THEN r.church_name WHEN COALESCE(r.church_name, '') = '' THEN r.group_name
      ELSE r.group_name || ' · ' || r.church_name END AS organization_name, r.created_at,
    t.id AS trainee_id, t.full_name, t.role, t.email, t.kingschat_username, t.phone_country_code, t.phone_number, t.languages_spoken
    FROM media_training_registrations r JOIN media_training_trainees t ON t.registration_id = r.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${sort} ${direction}, t.id ASC`).all(params);
}

mediaTraining.post("/registrations", wrap(async (req, res) => {
  const parsed = mediaTrainingRegistrationSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION", parsed.error.issues[0]?.message || "Check the registration details.");
  const data = parsed.data;
  const canonicalZone = (await loadZones()).find((row) => row.zone.toLowerCase() === data.zone_name.toLowerCase())?.zone;
  if (!canonicalZone) throw new ApiError(400, "INVALID_ZONE", "Choose a zone from the official zone directory.");
  const churchCountry = COUNTRIES.find((country) => country.code === data.church_country_code);
  if (!churchCountry) throw new ApiError(400, "INVALID_COUNTRY", "Choose the church country from the provided list.");
  const reference = `GMT-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  db.transaction(() => {
    const registrationId = db.prepare("INSERT INTO media_training_registrations (reference_code, zone_name, group_name, church_name, organization_name, primary_timezone, church_country_code, church_country_name, church_city, church_city_place_id) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?)")
      .run(reference, canonicalZone, data.group_name, data.church_name, data.church_name, churchCountry.code, churchCountry.name, data.church_city, data.church_city_place_id).lastInsertRowid;
    const insert = db.prepare(`INSERT INTO media_training_trainees
      (registration_id, full_name, role, email, kingschat_username, phone_country_code, phone_number, languages_spoken) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insert.run(registrationId, data.full_name, data.role === "Other" ? data.other_role : data.role, data.email,
      data.kingschat_username.replace(/^@/, ""), data.phone_country_code, data.phone_number, data.languages_spoken.join(", "));
  })();
  res.status(201).json({ reference_code: reference, zone_name: canonicalZone, group_name: data.group_name, church_name: data.church_name, church_country_name: churchCountry.name, church_city: data.church_city, languages_spoken: data.languages_spoken, full_name: data.full_name, training_date: "2026-08-24" });
}));

mediaTraining.get("/admin", requireSuperAdmin, wrap((req, res) => {
  const rows = mediaTrainingRows(req.query);
  const totals = db.prepare(`SELECT COUNT(*) AS registrations,
    (SELECT COUNT(*) FROM media_training_trainees) AS trainees FROM media_training_registrations`).get();
  const zones = db.prepare("SELECT DISTINCT zone_name AS name FROM media_training_registrations WHERE zone_name IS NOT NULL ORDER BY name COLLATE NOCASE").all().map((row) => row.name);
  const roles = db.prepare("SELECT DISTINCT role AS name FROM media_training_trainees ORDER BY name COLLATE NOCASE").all().map((row) => row.name);
  res.json({ rows, filtered_total: rows.length, ...totals, filter_options: { zones, roles } });
}));

const exportColumns = [
  { header: "Reference", value: (row) => row.reference_code }, { header: "Zone", value: (row) => row.zone_name },
  { header: "Group", value: (row) => row.group_name }, { header: "Church", value: (row) => row.church_name }, { header: "Trainee", value: (row) => row.full_name },
  { header: "Church Country", value: (row) => row.church_country_name }, { header: "Church City", value: (row) => row.church_city }, { header: "Languages Spoken", value: (row) => row.languages_spoken },
  { header: "Role", value: (row) => row.role }, { header: "Email", value: (row) => row.email },
  { header: "KingsChat Username", value: (row) => row.kingschat_username ? `@${row.kingschat_username}` : "" },
  { header: "Phone", value: (row) => `${row.phone_country_code} ${row.phone_number}` }, { header: "Submitted At (UTC)", value: (row) => row.created_at },
];
mediaTraining.get("/admin/export", requireSuperAdmin, wrap(async (req, res) => {
  await sendExport(res, req.query.format === "csv" ? "csv" : "xlsx", "global-media-training", exportColumns, mediaTrainingRows(req.query));
}));

mediaTraining.delete("/admin/:id", requireSuperAdmin, wrap((req, res) => {
  const result = db.prepare("DELETE FROM media_training_registrations WHERE id = ?").run(req.params.id);
  if (!result.changes) throw new ApiError(404, "NOT_FOUND", "Training registration not found.");
  res.status(204).end();
}));
