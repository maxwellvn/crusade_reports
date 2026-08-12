import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { requirePageAccess } from "../auth.js";
import { ApiError, wrap } from "../logger.js";
import { missionTripVolunteerSchema } from "../validation.js";
import { COUNTRIES } from "./countries.js";
import { sendExport } from "./exporter.js";

export const missionTrips = Router();
const country = (code) => COUNTRIES.find((item) => item.code === code);

export function missionTripRows(query = {}) {
  const where = []; const params = {};
  const q = String(query.q || "").trim().slice(0, 100);
  if (q) { where.push("(first_name || ' ' || last_name LIKE @q OR email LIKE @q OR kingschat_username LIKE @q OR zone_name LIKE @q)"); params.q = `%${q}%`; }
  for (const [key, column] of [["zone", "zone_name"], ["passport", "passport_country_code"], ["destination", "preferred_destination_code"]]) {
    const value = String(query[key] || "").trim().slice(0, 250); if (value) { where.push(`${column} = @${key} COLLATE NOCASE`); params[key] = value; }
  }
  const direction = String(query.direction).toLowerCase() === "asc" ? "ASC" : "DESC";
  const sort = { created_at: "created_at", name: "last_name COLLATE NOCASE", zone: "zone_name COLLATE NOCASE", passport: "passport_country_name COLLATE NOCASE", destination: "preferred_destination_name COLLATE NOCASE" }[query.sort] || "created_at";
  return db.prepare(`SELECT * FROM mission_trip_volunteers ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${sort} ${direction}, id DESC`).all(params);
}

missionTrips.post("/registrations", wrap((req, res) => {
  const parsed = missionTripVolunteerSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION", parsed.error.issues[0]?.message || "Check the registration details.");
  const data = parsed.data; const passport = country(data.passport_country_code); const destination = country(data.preferred_destination_code);
  if (!passport || !destination || data.additional_passports.some((code) => !country(code))) throw new ApiError(400, "INVALID_COUNTRY", "Choose countries from the provided list.");
  const reference = `MTV-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  db.prepare(`INSERT INTO mission_trip_volunteers (reference_code, designation, first_name, last_name, email, phone_country_code, phone_number, kingschat_username, zone_name, group_name, church_name, passport_country_code, passport_country_name, additional_passports, passport_expiry, preferred_destination_code, preferred_destination_name, ready_for_any_destination, valid_passport, covers_travel_expenses, medically_fit, sponsor_interest, partnership_acknowledged, additional_information) VALUES (@reference, @designation, @first_name, @last_name, @email, @phone_country_code, @phone_number, @kingschat_username, @zone_name, @group_name, @church_name, @passport_code, @passport_name, @additional, @passport_expiry, @destination_code, @destination_name, @ready, 1, 1, 1, @sponsor, 1, @notes)`).run({ reference, ...data, kingschat_username: data.kingschat_username.replace(/^@/, ""), passport_code: passport.code, passport_name: passport.name, additional: data.additional_passports.join(","), destination_code: destination.code, destination_name: destination.name, ready: Number(data.ready_for_any_destination), sponsor: Number(data.sponsor_interest), notes: data.additional_information || null });
  res.status(201).json({ reference_code: reference, full_name: `${data.first_name} ${data.last_name}`, passport_country_name: passport.name, preferred_destination_name: destination.name, sponsor_interest: data.sponsor_interest });
}));

missionTrips.get("/admin", requirePageAccess("dashboard/mission-trips"), wrap((req, res) => {
  const rows = missionTripRows(req.query);
  const options = { zones: db.prepare("SELECT DISTINCT zone_name name FROM mission_trip_volunteers WHERE trim(COALESCE(zone_name,'')) <> '' ORDER BY name COLLATE NOCASE").all().map((r) => r.name), passports: db.prepare("SELECT DISTINCT passport_country_code code, passport_country_name name FROM mission_trip_volunteers ORDER BY name COLLATE NOCASE").all(), destinations: db.prepare("SELECT DISTINCT preferred_destination_code code, preferred_destination_name name FROM mission_trip_volunteers ORDER BY name COLLATE NOCASE").all() };
  res.json({ rows, total: db.prepare("SELECT COUNT(*) count FROM mission_trip_volunteers").get().count, filtered_total: rows.length, filter_options: options });
}));

const columns = [{ header: "Reference", value: (r) => r.reference_code }, { header: "Name", value: (r) => `${r.first_name} ${r.last_name}` }, { header: "Designation", value: (r) => r.designation }, { header: "Passport", value: (r) => r.passport_country_name }, { header: "Additional passports", value: (r) => r.additional_passports }, { header: "Passport expiry", value: (r) => r.passport_expiry }, { header: "Preferred destination", value: (r) => r.preferred_destination_name }, { header: "Any destination", value: (r) => r.ready_for_any_destination ? "Yes" : "No" }, { header: "Zone", value: (r) => r.zone_name }, { header: "Group", value: (r) => r.group_name }, { header: "Church", value: (r) => r.church_name }, { header: "Email", value: (r) => r.email }, { header: "Phone", value: (r) => `${r.phone_country_code} ${r.phone_number}` }, { header: "KingsChat", value: (r) => `@${r.kingschat_username}` }, { header: "Sponsor interest", value: (r) => r.sponsor_interest ? "Yes" : "No" }, { header: "Additional information", value: (r) => r.additional_information }, { header: "Submitted at (UTC)", value: (r) => r.created_at }];
missionTrips.get("/admin/export", requirePageAccess("dashboard/mission-trips"), wrap(async (req, res) => sendExport(res, req.query.format === "csv" ? "csv" : "xlsx", "mission-trip-volunteers", columns, missionTripRows(req.query))));
missionTrips.delete("/admin/:id", requirePageAccess("dashboard/mission-trips"), wrap((req, res) => { const result = db.prepare("DELETE FROM mission_trip_volunteers WHERE id = ?").run(req.params.id); if (!result.changes) throw new ApiError(404, "NOT_FOUND", "Volunteer registration not found."); res.status(204).end(); }));
