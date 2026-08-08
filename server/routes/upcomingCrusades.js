import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { requirePageAccess } from "../auth.js";
import { ApiError, wrap } from "../logger.js";
import { upcomingCrusadeInterestSchema } from "../validation.js";
import { UPCOMING_CRUSADES, upcomingCrusadeByCode } from "../upcomingCrusadesData.js";
import { COUNTRIES } from "./countries.js";
import { loadZones } from "./zones.js";
import { sendExport } from "./exporter.js";

export const upcomingCrusades = Router();
const countries = new Map(COUNTRIES.map((item) => [item.code, item]));

function catalogue() {
  const totals = new Map(db.prepare(`SELECT code, COUNT(*) count FROM (
    SELECT opportunity_code code FROM upcoming_crusade_interests
    UNION ALL SELECT second_opportunity_code code FROM upcoming_crusade_interests WHERE second_opportunity_code IS NOT NULL
  ) GROUP BY code`).all().map((row) => [row.code, row.count]));
  return UPCOMING_CRUSADES.map((item) => ({ ...item, interest_count: totals.get(item.code) || 0 }));
}

upcomingCrusades.get("/", wrap((_req, res) => {
  res.json({ opportunities: catalogue(), total: UPCOMING_CRUSADES.length });
}));

upcomingCrusades.post("/interests", wrap(async (req, res) => {
  const parsed = upcomingCrusadeInterestSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION", parsed.error.issues[0]?.message || "Check the required details.");
  const data = parsed.data;
  const selected = data.opportunity_codes.map((code) => upcomingCrusadeByCode.get(code));
  const [opportunity, secondOpportunity] = selected;
  const passport = countries.get(data.passport_country_code);
  if (selected.some((item) => !item)) throw new ApiError(400, "INVALID_CRUSADE", "Choose upcoming crusades from the published list.");
  if (!passport) throw new ApiError(400, "INVALID_PASSPORT", "Choose your passport country from the provided list.");
  if (data.passport_expiry < new Date().toISOString().slice(0, 7)) throw new ApiError(400, "PASSPORT_EXPIRED", "Your passport expiry must be in the future.");

  const zone = (await loadZones()).find((item) => item.zone.toLowerCase() === data.zone_name.toLowerCase());
  if (!zone) throw new ApiError(400, "INVALID_ZONE", "Choose a zone from the official directory.");
  const group = data.group_name ? zone.groups.find((item) => item.name.toLowerCase() === data.group_name.toLowerCase()) : null;
  if (data.group_name && !group) throw new ApiError(400, "INVALID_GROUP", "Choose a group that belongs to the selected zone, or leave group blank.");

  const reference = `UC-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  try {
    db.prepare(`INSERT INTO upcoming_crusade_interests
      (reference_code, full_name, zone_name, group_name, email, kingschat_username, phone_country_code, phone_number,
       passport_country_code, passport_country_name, passport_expiry, opportunity_code, opportunity_nation,
       opportunity_dates, opportunity_names, opportunity_types, opportunity_cities, second_opportunity_code,
       second_opportunity_nation, second_opportunity_dates, second_opportunity_names, second_opportunity_types,
       second_opportunity_cities, additional_information)
      VALUES (@reference, @full_name, @zone, @group_name, @email, @kingschat_username, @phone_country_code, @phone_number,
       @passport_code, @passport_name, @passport_expiry, @opportunity_code, @nation, @dates, @names, @types, @cities,
       @second_code, @second_nation, @second_dates, @second_names, @second_types, @second_cities, @notes)`)
      .run({
        reference, ...data, zone: zone.zone, group_name: group?.name || null,
        kingschat_username: data.kingschat_username.replace(/^@/, ""),
        passport_code: passport.code, passport_name: passport.name,
        opportunity_code: opportunity.code, nation: opportunity.nation, dates: opportunity.dates, names: opportunity.names,
        types: opportunity.types, cities: opportunity.cities, notes: data.additional_information || null,
        second_code: secondOpportunity?.code || null, second_nation: secondOpportunity?.nation || null,
        second_dates: secondOpportunity?.dates || null, second_names: secondOpportunity?.names || null,
        second_types: secondOpportunity?.types || null, second_cities: secondOpportunity?.cities || null,
      });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") throw new ApiError(409, "ZONE_ALREADY_REGISTERED", "This zone has already indicated an upcoming crusade preference.");
    throw error;
  }
  res.status(201).json({
    reference_code: reference, full_name: data.full_name, zone_name: zone.zone,
    group_name: group?.name || "", opportunities: selected.map(({ code, nation, dates, names, cities }) => ({ code, nation, dates, names, cities })),
  });
}));

const SORTS = {
  created_at: "created_at", name: "full_name COLLATE NOCASE", zone: "zone_name COLLATE NOCASE",
  destination: "opportunity_nation COLLATE NOCASE", passport: "passport_country_name COLLATE NOCASE",
};

function rows(query = {}) {
  const where = []; const params = {};
  const q = String(query.q || "").trim().slice(0, 100);
  if (q) { where.push("(full_name LIKE @q OR zone_name LIKE @q OR group_name LIKE @q OR email LIKE @q OR kingschat_username LIKE @q OR opportunity_nation LIKE @q OR reference_code LIKE @q)"); params.q = `%${q}%`; }
  for (const [key, column] of [["zone", "zone_name"], ["destination", "opportunity_code"], ["passport", "passport_country_code"]]) {
    const value = String(query[key] || "").trim().slice(0, 250);
    if (value) {
      where.push(key === "destination" ? `(opportunity_code = @destination OR second_opportunity_code = @destination)` : `${column} = @${key} COLLATE NOCASE`);
      params[key] = value;
    }
  }
  const direction = String(query.direction).toLowerCase() === "asc" ? "ASC" : "DESC";
  const sort = SORTS[query.sort] || SORTS.created_at;
  return db.prepare(`SELECT * FROM upcoming_crusade_interests ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${sort} ${direction}, id DESC`).all(params);
}

upcomingCrusades.get("/admin", requirePageAccess("dashboard/upcoming-crusades"), wrap((req, res) => {
  const result = rows(req.query);
  res.json({
    rows: result,
    total: db.prepare("SELECT COUNT(*) count FROM upcoming_crusade_interests").get().count,
    filtered_total: result.length,
    filter_options: {
      zones: db.prepare("SELECT DISTINCT zone_name name FROM upcoming_crusade_interests ORDER BY name COLLATE NOCASE").all().map((row) => row.name),
      passports: db.prepare("SELECT DISTINCT passport_country_code code, passport_country_name name FROM upcoming_crusade_interests ORDER BY name COLLATE NOCASE").all(),
      destinations: UPCOMING_CRUSADES.map(({ code, nation }) => ({ code, name: nation })),
    },
  });
}));

const columns = [
  { header: "Reference", value: (row) => row.reference_code }, { header: "Name", value: (row) => row.full_name },
  { header: "Zone", value: (row) => row.zone_name }, { header: "Group", value: (row) => row.group_name },
  { header: "Selected nations", value: (row) => [row.opportunity_nation, row.second_opportunity_nation].filter(Boolean).join("; ") }, { header: "Crusade dates", value: (row) => [row.opportunity_dates, row.second_opportunity_dates].filter(Boolean).join("; ") },
  { header: "Crusades", value: (row) => [row.opportunity_names, row.second_opportunity_names].filter(Boolean).join("; ") }, { header: "Cities", value: (row) => [row.opportunity_cities, row.second_opportunity_cities].filter(Boolean).join("; ") },
  { header: "Passport", value: (row) => row.passport_country_name }, { header: "Passport expiry", value: (row) => row.passport_expiry },
  { header: "Email", value: (row) => row.email }, { header: "Phone", value: (row) => `${row.phone_country_code} ${row.phone_number}` },
  { header: "KingsChat", value: (row) => `@${row.kingschat_username}` }, { header: "Additional information", value: (row) => row.additional_information },
  { header: "Submitted at (UTC)", value: (row) => row.created_at },
];

upcomingCrusades.get("/admin/export", requirePageAccess("dashboard/upcoming-crusades"), wrap(async (req, res) => {
  await sendExport(res, req.query.format === "csv" ? "csv" : "xlsx", "upcoming-crusade-interests", columns, rows(req.query));
}));

upcomingCrusades.delete("/admin/:id", requirePageAccess("dashboard/upcoming-crusades"), wrap((req, res) => {
  const result = db.prepare("DELETE FROM upcoming_crusade_interests WHERE id = ?").run(req.params.id);
  if (!result.changes) throw new ApiError(404, "NOT_FOUND", "Upcoming crusade interest not found.");
  res.status(204).end();
}));
