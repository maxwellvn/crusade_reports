import { Router } from "express";
import { db } from "../db.js";
import { registrationCrusadeEditSchema, registrationSchema } from "../validation.js";
import { wrap, ApiError } from "../logger.js";
import { requireAdmin, requireSuperAdmin } from "../auth.js";
import { backfillCityCoords } from "./places.js";
import { applyPortalScope } from "../portalScope.js";
import { ensureReportingOpen } from "../appSettings.js";
import { submitRegisteredCrusadeReport } from "./reports.js";

export const registrations = Router();

export function deleteRegistrationCrusade(id) {
  const item = db.prepare(`
    SELECT i.id, i.registration_id,
           EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id) AS report_submitted
    FROM registration_items i WHERE i.id = ?
  `).get(id);
  if (!item) throw new ApiError(404, "NOT_FOUND", "Registered crusade not found.");
  if (item.report_submitted) {
    throw new ApiError(409, "REPORT_EXISTS", "Delete this crusade's report before deleting its registration.");
  }

  return db.transaction(() => {
    db.prepare("DELETE FROM registration_items WHERE id = ?").run(item.id);
    const registrationDeleted = !db.prepare("SELECT 1 FROM registration_items WHERE registration_id = ?").get(item.registration_id);
    if (registrationDeleted) {
      db.prepare("DELETE FROM registrations WHERE id = ?").run(item.registration_id);
    } else {
      db.prepare(`UPDATE registrations SET plan_date =
        (SELECT MIN(event_date) FROM registration_items WHERE registration_id = ?) WHERE id = ?`
      ).run(item.registration_id, item.registration_id);
    }
    return { id: item.id, registration_id: item.registration_id, registration_deleted: registrationDeleted };
  })();
}

const insertRegStmt = db.prepare(`
  INSERT INTO registrations (organization_type, zone, group_name, church_name, cell_name, network_name, country, plan_date,
    contact_name, contact_email, phone_country_code, phone_number, kingschat_username)
  VALUES (@organization_type, @zone, @group_name, @church_name, @cell_name, @network_name, @country, @plan_date,
    @contact_name, @contact_email, @phone_country_code, @phone_number, @kingschat_username)
`);
const ITEM_COLS = ["registration_id", "organization_type", "zone", "group_name", "church_name", "cell_name", "network_name", "country", "plan_date",
  "event_type", "planned_count", "event_name", "event_date", "venue", "expected_attendance", "minister_name", "city", "city_place_id",
  "crusade_collaborators", "zone_contribution", "estimated_budget", "rhapsody_copies_confirmed", "permits_obtained", "media_coverage_plan",
  "readiness_status"];

// Multi-select network fields arrive as arrays; store one comma-joined string per
// crusade (null when empty) so dashboards can render and search them directly.
const joinList = (value) => Array.isArray(value) && value.length ? value.map((v) => String(v).trim()).filter(Boolean).join(", ") || null : null;
const orNull = (value) => { const s = String(value ?? "").trim(); return s || null; };
const insertItemStmt = db.prepare(
  `INSERT INTO registration_items (${ITEM_COLS.join(", ")}) VALUES (${ITEM_COLS.map((c) => "@" + c).join(", ")})`
);

const insertRegistration = db.transaction((d) => {
  const planDate = d.items.map((item) => item.event_date).sort()[0];
  const base = {
    organization_type: d.organization_type,
    zone: d.zone || null,
    group_name: d.group_name || null,
    church_name: d.church_name || null,
    cell_name: d.cell_name || null,
    network_name: d.network_name || null,
    country: d.country,
    plan_date: planDate,
    contact_name: d.contact_name,
    contact_email: d.contact_email,
    phone_country_code: d.phone_country_code,
    phone_number: d.phone_number,
    kingschat_username: d.kingschat_username,
  };
  const regId = insertRegStmt.run(base).lastInsertRowid;
  for (const it of d.items) {
    insertItemStmt.run({
      ...base,
      registration_id: regId,
      event_type: it.event_type,
      planned_count: 1,
      event_name: it.event_name,
      event_date: it.event_date,
      venue: it.venue,
      expected_attendance: it.expected_attendance,
      minister_name: it.minister_name || null,
      city: it.city || null,
      city_place_id: it.city_place_id || null,
      crusade_collaborators: joinList(it.crusade_collaborators),
      zone_contribution: joinList(it.zone_contribution),
      estimated_budget: orNull(it.estimated_budget),
      rhapsody_copies_confirmed: orNull(it.rhapsody_copies_confirmed),
      permits_obtained: orNull(it.permits_obtained),
      media_coverage_plan: orNull(it.media_coverage_plan),
      // Logging a crusade confirms it by default; the coordinator can still edit
      // the readiness afterwards (preparing, ready, not holding, …).
      readiness_status: "confirmed",
    });
  }
  return regId;
});

registrations.post("/", wrap((req, res) => {
  const payload = applyPortalScope(req.body, String(req.body?.portal_token || ""));
  const parsed = registrationSchema.safeParse(payload);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid data");
  const id = insertRegistration(parsed.data);
  backfillCityCoords().catch(() => {});
  res.status(201).json({ id });
}));

// A crusade's network planning details (collaborators, contribution, budget,
// Rhapsody copies, permits, media plan) may only change up to its date — once the
// crusade date has passed they lock, so the pre-crusade plan can't be rewritten
// after the fact. The rest of the crusade stays editable regardless.
export function planningEditable(eventDate) {
  if (!eventDate) return true;
  return eventDate >= db.prepare("SELECT date('now') AS today").get().today;
}

export function updateRegistrationCrusade(id, d) {
  const crusade = db.prepare("SELECT id, registration_id, event_date FROM registration_items WHERE id = ?").get(id);
  if (!crusade) return null;
  const canEditPlanning = planningEditable(crusade.event_date);
  db.transaction(() => {
    const assignments = [
      "event_type = @event_type", "event_name = @event_name", "event_date = @event_date", "venue = @venue",
      "expected_attendance = @expected_attendance", "minister_name = @minister_name", "city = @city", "city_place_id = @city_place_id",
      "readiness_status = @status", "readiness_notes = @feedback", "readiness_updated_at = datetime('now')",
    ];
    const params = {
      id: crusade.id, event_type: d.event_type, event_name: d.event_name, event_date: d.event_date, venue: d.venue,
      expected_attendance: d.expected_attendance, minister_name: d.minister_name || null, city: d.city,
      city_place_id: d.city_place_id || null, status: d.status, feedback: d.feedback || null,
    };
    if (canEditPlanning) {
      assignments.push(
        "crusade_collaborators = @crusade_collaborators", "zone_contribution = @zone_contribution",
        "estimated_budget = @estimated_budget", "rhapsody_copies_confirmed = @rhapsody_copies_confirmed",
        "permits_obtained = @permits_obtained", "media_coverage_plan = @media_coverage_plan",
      );
      params.crusade_collaborators = joinList(d.crusade_collaborators);
      params.zone_contribution = joinList(d.zone_contribution);
      params.estimated_budget = orNull(d.estimated_budget);
      params.rhapsody_copies_confirmed = orNull(d.rhapsody_copies_confirmed);
      params.permits_obtained = orNull(d.permits_obtained);
      params.media_coverage_plan = orNull(d.media_coverage_plan);
    }
    db.prepare(`UPDATE registration_items SET ${assignments.join(", ")} WHERE id = @id`).run(params);
    db.prepare(`UPDATE registrations SET plan_date = (SELECT MIN(event_date) FROM registration_items WHERE registration_id = ?)
      WHERE id = ?`).run(crusade.registration_id, crusade.registration_id);
  })();
  backfillCityCoords().catch(() => {});
  return db.prepare(`SELECT id, event_type, event_name, event_date, venue, expected_attendance, minister_name, city, city_place_id,
    crusade_collaborators, zone_contribution, estimated_budget, rhapsody_copies_confirmed, permits_obtained, media_coverage_plan,
    readiness_status, readiness_notes, readiness_updated_at FROM registration_items WHERE id = ?`).get(crusade.id);
}

registrations.put("/:id", requireAdmin, wrap((req, res) => {
  const parsed = registrationCrusadeEditSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid crusade details.");
  const updated = updateRegistrationCrusade(req.params.id, parsed.data);
  if (!updated) throw new ApiError(404, "NOT_FOUND", "Registered crusade not found.");
  res.json(updated);
}));

registrations.delete("/:id", requireSuperAdmin, wrap((req, res) => {
  res.json(deleteRegistrationCrusade(req.params.id));
}));

registrations.post("/:id/report", requireAdmin, wrap((req, res) => {
  ensureReportingOpen();
  const item = db.prepare(`
    SELECT i.*, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username
    FROM registration_items i JOIN registrations r ON r.id = i.registration_id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!item) throw new ApiError(404, "NOT_FOUND", "Registered crusade not found.");
  res.status(201).json(submitRegisteredCrusadeReport(item, req.body));
}));

// The org display name, dashboard-style: most specific level first.
const ORG_LABEL = "COALESCE(r.cell_name, r.church_name, r.group_name, r.network_name, r.zone, r.organization_type)";

// GET /api/registrations/live — everything the live dashboard + landing page need.
registrations.get("/live", requireAdmin, wrap((_req, res) => {
  const totals = db.prepare(`
    SELECT (SELECT COUNT(*) FROM registrations) AS registrations,
           COALESCE(SUM(planned_count), 0)      AS planned,
           COUNT(*)                             AS items,
           COUNT(DISTINCT country)              AS countries,
           COUNT(DISTINCT event_type)           AS types,
           COALESCE(SUM(expected_attendance), 0) AS expected_attendance,
           SUM(CASE WHEN readiness_status = 'ready' THEN 1 ELSE 0 END) AS ready,
           SUM(CASE WHEN readiness_status = 'not_holding' THEN 1 ELSE 0 END) AS not_holding,
           (SELECT COUNT(*) FROM crusades WHERE registration_item_id IS NOT NULL) AS reported,
           COALESCE(SUM(planned_count), 0) - (SELECT COUNT(*) FROM crusades WHERE registration_item_id IS NOT NULL) AS awaiting
    FROM registration_items
  `).get();

  res.json({
    totals,
    by_type: db.prepare(
      `SELECT event_type AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items GROUP BY event_type ORDER BY planned DESC`
    ).all(),
    by_country: db.prepare(
      `SELECT country AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items GROUP BY country ORDER BY planned DESC`
    ).all(),
    by_zone: db.prepare(
      `SELECT zone AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE zone IS NOT NULL GROUP BY zone ORDER BY planned DESC`
    ).all(),
    by_network: db.prepare(
      `SELECT network_name AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE network_name IS NOT NULL GROUP BY network_name ORDER BY planned DESC`
    ).all(),
    by_group: db.prepare(
      `SELECT group_name AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE group_name IS NOT NULL GROUP BY group_name ORDER BY planned DESC`
    ).all(),
    by_church: db.prepare(
      `SELECT church_name AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE church_name IS NOT NULL GROUP BY church_name ORDER BY planned DESC`
    ).all(),
    by_cell: db.prepare(
      `SELECT cell_name AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE cell_name IS NOT NULL GROUP BY cell_name ORDER BY planned DESC`
    ).all(),
    by_city: db.prepare(
      `SELECT city AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items WHERE city IS NOT NULL GROUP BY city ORDER BY planned DESC`
    ).all(),
    by_org_type: db.prepare(
      `SELECT organization_type AS key, SUM(planned_count) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items GROUP BY organization_type ORDER BY planned DESC`
    ).all(),
    by_readiness: db.prepare(
      `SELECT readiness_status AS key, COUNT(*) AS planned, COUNT(DISTINCT registration_id) AS registrations
       FROM registration_items GROUP BY readiness_status ORDER BY planned DESC`
    ).all(),
    // Real city points (geocoded) for the coverage map.
    geo: db.prepare(
      `SELECT city AS key, country, MAX(city_lat) AS lat, MAX(city_lng) AS lng, SUM(planned_count) AS planned
       FROM registration_items WHERE city_lat IS NOT NULL GROUP BY city, country`
    ).all(),
    // The live feed: latest registrations with their own totals.
    recent: db.prepare(
      `SELECT r.id, r.created_at, r.organization_type, r.zone, r.group_name, r.church_name, r.cell_name, r.network_name, r.country, r.plan_date,
              ${ORG_LABEL} AS org,
              COALESCE(SUM(i.planned_count), 0) AS planned, COUNT(i.id) AS types
       FROM registrations r LEFT JOIN registration_items i ON i.registration_id = r.id
       GROUP BY r.id ORDER BY r.created_at DESC, r.id DESC LIMIT 25`
    ).all(),
  });
}));

// GET /api/registrations — paginated, filtered, sorted table for the admin view.
registrations.get("/", requireAdmin, wrap((req, res) => {
  const where = [];
  const params = {};

  for (const col of ["organization_type", "zone", "group_name", "church_name", "cell_name", "country", "network_name"]) {
    if (req.query[col]) { where.push(`r.${col} = @${col}`); params[col] = String(req.query[col]); }
  }
  if (req.query.city) { where.push("i.city = @city"); params.city = String(req.query.city); }
  if (req.query.readiness_status) {
    where.push("i.readiness_status = @readiness_status");
    params.readiness_status = String(req.query.readiness_status);
  }
  if (req.query.report_status === "reported") where.push("EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id)");
  if (req.query.report_status === "unreported") where.push("NOT EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id)");
  if (req.query.event_type) {
    where.push("i.event_type = @event_type");
    params.event_type = String(req.query.event_type);
  }
  if (req.query.date_from) { where.push("i.event_date >= @date_from"); params.date_from = String(req.query.date_from); }
  if (req.query.date_to) { where.push("i.event_date <= @date_to"); params.date_to = String(req.query.date_to); }

  // Free-text search: every word must match some field of the registration or
  // its items. ponytail: LIKE, not FTS — org/city names at this volume don't
  // need an index; clone the crusades_fts pattern if registrations ever do.
  String(req.query.q || "").trim().split(/\s+/).filter(Boolean).slice(0, 8).forEach((tok, n) => {
    const p = `q${n}`;
    where.push(`(r.zone LIKE @${p} OR r.group_name LIKE @${p} OR r.church_name LIKE @${p} OR r.network_name LIKE @${p} OR r.country LIKE @${p}
      OR r.contact_name LIKE @${p} OR r.contact_email LIKE @${p} OR r.phone_country_code || r.phone_number LIKE @${p}
      OR r.kingschat_username LIKE @${p}
      OR i.city LIKE @${p} OR i.event_type LIKE @${p} OR i.event_name LIKE @${p} OR i.venue LIKE @${p}
      OR i.readiness_status LIKE @${p} OR i.readiness_notes LIKE @${p})`);
    params[p] = `%${tok}%`;
  });

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageSize = Math.min(Math.max(parseInt(req.query.page_size, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const SORT = {
    created_at: "r.created_at", event_date: "i.event_date", event_name: "i.event_name COLLATE NOCASE",
    event_type: "i.event_type COLLATE NOCASE", expected_attendance: "i.expected_attendance",
    zone: "r.zone COLLATE NOCASE", country: "r.country COLLATE NOCASE", org: "org COLLATE NOCASE",
  };
  const sortCol = SORT[req.query.sort] || "r.created_at";
  const dir = req.query.dir === "asc" ? "ASC" : "DESC";

  const total = db.prepare(`SELECT COUNT(*) AS n FROM registration_items i JOIN registrations r ON r.id = i.registration_id ${clause}`).get(params).n;
  const rows = db.prepare(
    `SELECT i.id, i.registration_id, i.event_type, i.planned_count, i.event_name, i.event_date, i.venue,
            i.expected_attendance, i.minister_name, i.city, i.city_place_id, i.readiness_status, i.readiness_notes, i.readiness_updated_at,
            i.crusade_collaborators, i.zone_contribution, i.estimated_budget, i.rhapsody_copies_confirmed, i.permits_obtained, i.media_coverage_plan,
            r.created_at AS registered_at, r.organization_type, r.zone, r.group_name, r.church_name, r.cell_name,
            r.network_name, r.country, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number,
            r.kingschat_username, ${ORG_LABEL} AS org,
            EXISTS (SELECT 1 FROM crusades c WHERE c.registration_item_id = i.id) AS report_submitted,
            (SELECT c.id FROM crusades c WHERE c.registration_item_id = i.id LIMIT 1) AS report_crusade_id
     FROM registration_items i JOIN registrations r ON r.id = i.registration_id
     ${clause} ORDER BY ${sortCol} ${dir}, i.id DESC LIMIT @limit OFFSET @offset`
  ).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  res.json({ rows, total, page, page_size: pageSize });
}));
