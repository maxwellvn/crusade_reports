import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { wrap, ApiError } from "../logger.js";
import { requireAdmin } from "../auth.js";
import { registrationCrusadeEditSchema } from "../validation.js";
import { updateRegistrationCrusade } from "./registrations.js";
import { submitRegisteredCrusadeReport } from "./reports.js";
import { loadZones } from "./zones.js";
import { ensureReportingOpen, isReportingOpen } from "../appSettings.js";
import { parseReportPayload, removeUploadedFiles, withReportPhotoUpload } from "../reportMedia.js";

export const zonePortal = Router();

// GET /api/zone-links — ALL zones (upstream list) and ALL networks, each with
// its token if one exists. Data-only names (e.g. a zone missing upstream but
// present in reports) are included too, so nothing is unreachable.
zonePortal.get("/zone-links", requireAdmin, wrap(async (req, res) => {
  const tokens = db.prepare("SELECT zone AS name, token, kind FROM zone_tokens").all();
  const tokenFor = (kind, name) => tokens.find((t) => t.kind === kind && t.name === name)?.token || null;

  const zoneNames = new Set((await loadZones().catch(() => [])).map((z) => z.zone));
  db.prepare(`SELECT DISTINCT zone AS n FROM registrations WHERE zone IS NOT NULL
              UNION SELECT DISTINCT zone FROM crusades WHERE zone IS NOT NULL`).all()
    .forEach((r) => zoneNames.add(r.n));
  tokens.filter((t) => t.kind === "zone").forEach((t) => zoneNames.add(t.name));

  const networkNames = new Set(db.prepare("SELECT name FROM networks").all().map((r) => r.name));
  db.prepare(`SELECT DISTINCT network_name AS n FROM registrations WHERE network_name IS NOT NULL
              UNION SELECT DISTINCT network_name FROM crusades WHERE network_name IS NOT NULL`).all()
    .forEach((r) => networkNames.add(r.n));
  tokens.filter((t) => t.kind === "network").forEach((t) => networkNames.add(t.name));

  const sortByName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  res.json({
    zones: [...zoneNames].map((name) => ({ name, token: tokenFor("zone", name) })).sort(sortByName),
    networks: [...networkNames].map((name) => ({ name, token: tokenFor("network", name) })).sort(sortByName),
  });
}));

// POST /api/zone-links { name, kind } — create or regenerate a token.
zonePortal.post("/zone-links", requireAdmin, wrap((req, res) => {
  const name = String(req.body?.name || "").trim();
  const kind = req.body?.kind === "network" ? "network" : "zone";
  if (!name) throw new ApiError(422, "VALIDATION", "Name is required");
  const token = randomBytes(16).toString("base64url");
  db.prepare(`
    INSERT INTO zone_tokens (zone, token, kind) VALUES (?, ?, ?)
    ON CONFLICT(zone) DO UPDATE SET token = excluded.token, kind = excluded.kind, created_at = datetime('now')
  `).run(name, token, kind);
  res.json({ name, kind, token });
}));

// ---- Zone portal: token-scoped data ------------------------------------------

// These networks also see crusades of their event type submitted from any
// zone/group/church/cell — visible on their dashboard (visitor rows) but never
// counted in their totals; the numbers stay with the submitting org.
const NETWORK_EVENT_TYPES = {
  "Youths Aglow": "youths-aglow",
  "TEEVOLUTION": "teevolution",
  "Say Yes to Kids": "say-yes-to-kids",
};

// BLW campus/region zones are auto-detected by name: any zone whose name
// starts with "BLW" (case-insensitive). All crusades (any type) from these
// zones appear in the Youths Aglow network dashboard — both in listings AND
// in totals — without affecting the zone's own dashboard numbers or the
// global admin statistics. The zone keeps its own counts; Youths Aglow
// simply absorbs the BLW rows into its view.
const blwCampusZoneMatch = (prefix = "") =>
  `(LOWER(${prefix}zone) LIKE 'blw%')`;
const YOUTHS_AGLOW = "Youths Aglow";

// GET /api/zone-portal/:token — everything the zone dashboard shows. Every query
// is scoped to the token's zone; there is no way to reach another zone's rows.
zonePortal.get("/zone-portal/:token", wrap((req, res) => {
  const row = db.prepare("SELECT zone AS name, kind FROM zone_tokens WHERE token = ?").get(req.params.token);
  if (!row) throw new ApiError(404, "NOT_FOUND", "This link is not valid — ask your coordinator for a new one.");
  const { name, kind } = row;
  const col = kind === "network" ? "network_name" : "zone"; // fixed string, never user input
  const mappedType = kind === "network" ? NETWORK_EVENT_TYPES[name] : null;
  // Youths Aglow absorbs BLW campus/region zone crusades into its listings
  // AND totals. Other networks keep the existing visitor-rows-in-lists-only
  // behaviour for their mapped event type.
  const isYouthsAglow = kind === "network" && name === YOUTHS_AGLOW;

  // Visitor rows (matched by event type, owned by another org) appear in lists
  // only — totals below keep the strict ${col} scope. Youths Aglow also pulls
  // in BLW campus/region zone rows (all types) into both lists and totals.
  const listWhere = (prefix) => {
    if (isYouthsAglow) {
      return `(${prefix}${col} = ? OR ${prefix}event_type = ? OR (${prefix}zone IS NOT NULL AND ${blwCampusZoneMatch(prefix)}))`;
    }
    return mappedType
      ? `(${prefix}${col} = ? OR ${prefix}event_type = ?)`
      : `${prefix}${col} = ?`;
  };
  const listParams = mappedType ? [name, mappedType] : [name];

  // Totals scope: Youths Aglow includes BLW campus/region zone rows AND any
  // crusade with event_type='youths-aglow' from any zone; everyone else uses
  // strict ${col} = ? (own rows only).
  const totalsWhere = isYouthsAglow
    ? `(${col} = ? OR (zone IS NOT NULL AND ${blwCampusZoneMatch()}) OR event_type = 'youths-aglow')`
    : `${col} = ?`;

  const registrationsWhere = isYouthsAglow
    ? `(r.${col} = ? OR (r.zone IS NOT NULL AND ${blwCampusZoneMatch("r.")}))`
    : `r.${col} = ?`;

  const registrations = db.prepare(`
    SELECT r.id, r.created_at, r.organization_type, r.group_name, r.church_name, r.country, r.plan_date,
           COALESCE(SUM(i.planned_count), 0) AS planned
    FROM registrations r LEFT JOIN registration_items i ON i.registration_id = r.id
    WHERE ${registrationsWhere} AND (r.program = 'public' OR r.program IS NULL)
    GROUP BY r.id ORDER BY r.created_at DESC LIMIT 500
  `).all(name);

  const items = db.prepare(`
    SELECT registration_items.id, registration_items.registration_id, registration_items.event_type,
           registration_items.planned_count, registration_items.event_name,
           COALESCE(registration_items.event_date, registration_items.plan_date) AS event_date,
           registration_items.venue, registration_items.expected_attendance, registration_items.minister_name,
           registration_items.organization_type, registration_items.zone, registration_items.group_name,
           registration_items.church_name, registration_items.cell_name, registration_items.network_name,
           registration_items.city, registration_items.country, registration_items.city_place_id,
           registration_items.crusade_collaborators, registration_items.zone_contribution,
           registration_items.estimated_budget, registration_items.rhapsody_copies_confirmed,
           registration_items.permits_obtained, registration_items.media_coverage_plan,
           registration_items.readiness_status, registration_items.readiness_notes, registration_items.readiness_updated_at,
           crusades.id AS report_crusade_id, crusades.report_id, crusades.created_at AS reported_at,
           crusades.attendance AS reported_attendance, crusades.online_participation AS reported_online_participation,
           crusades.salvation AS reported_salvation,
           reg.contact_name, reg.contact_email, reg.phone_country_code, reg.phone_number, reg.kingschat_username
    FROM registration_items
    LEFT JOIN registrations reg ON reg.id = registration_items.registration_id
    LEFT JOIN crusades ON crusades.registration_item_id = registration_items.id
    WHERE ${listWhere("registration_items.")} AND (registration_items.program = 'public' OR registration_items.program IS NULL)
    ORDER BY COALESCE(registration_items.event_date, registration_items.plan_date), registration_items.id
  `).all(...listParams).map((r) => ({ ...r, visitor: r[col] !== name }));

  const crusades = db.prepare(`
    SELECT id, registration_item_id, event_date, event_type, other_event_type, event_name, format, city, country,
           organization_type, zone, group_name, church_name, cell_name, network_name,
           attendance, online_participation, salvation, minister_name, venue
    FROM crusades WHERE ${listWhere("")} ORDER BY event_date DESC, id DESC LIMIT 500
  `).all(...listParams).map((r) => ({ ...r, visitor: r[col] !== name }));

  const totals = {
    planned: db.prepare(`SELECT COALESCE(SUM(planned_count),0) n FROM registration_items WHERE ${totalsWhere} AND (program = 'public' OR program IS NULL)`).get(name).n,
    held: db.prepare(`SELECT COUNT(*) n FROM crusades WHERE ${totalsWhere}`).get(name).n,
    attendance: db.prepare(`SELECT COALESCE(SUM(attendance + online_participation),0) n FROM crusades WHERE ${totalsWhere}`).get(name).n,
    salvation: db.prepare(`SELECT COALESCE(SUM(salvation),0) n FROM crusades WHERE ${totalsWhere}`).get(name).n,
  };

  res.json({ zone: name, kind, reporting_open: isReportingOpen(), totals, registrations, items, crusades });
}));

// The capability token may update only individual crusades belonging to its zone/network.
zonePortal.put("/zone-portal/:token/crusades/:id/readiness", wrap((req, res) => {
  const token = db.prepare("SELECT zone AS name, kind FROM zone_tokens WHERE token = ?").get(req.params.token);
  if (!token) throw new ApiError(404, "NOT_FOUND", "This link is not valid — ask your coordinator for a new one.");

  const parsed = registrationCrusadeEditSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message || "Invalid crusade details.");
  const d = parsed.data;

  const col = token.kind === "network" ? "network_name" : "zone";
  const crusade = db.prepare(`SELECT id, registration_id, readiness_status FROM registration_items WHERE id = ? AND ${col} = ?`).get(req.params.id, token.name);
  if (!crusade) throw new ApiError(404, "NOT_FOUND", "Registered crusade not found on this dashboard.");

  res.json(updateRegistrationCrusade(crusade.id, d));
}));

// Submit outcomes for one registered crusade. Organization and reporter details
// come from its registration, so a capability link cannot report as another org.
zonePortal.post("/zone-portal/:token/crusades/:id/report", withReportPhotoUpload(wrap((req, res) => {
  ensureReportingOpen();
  const files = req.files || [];
  const token = db.prepare("SELECT zone AS name, kind FROM zone_tokens WHERE token = ?").get(req.params.token);
  if (!token) {
    removeUploadedFiles(files);
    throw new ApiError(404, "NOT_FOUND", "This link is not valid — ask your coordinator for a new one.");
  }

  const col = token.kind === "network" ? "network_name" : "zone";
  const item = db.prepare(`
    SELECT i.*, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username
    FROM registration_items i JOIN registrations r ON r.id = i.registration_id
    WHERE i.id = ? AND i.${col} = ?
  `).get(req.params.id, token.name);
  if (!item) {
    removeUploadedFiles(files);
    throw new ApiError(404, "NOT_FOUND", "Registered crusade not found on this dashboard.");
  }
  res.status(201).json(submitRegisteredCrusadeReport(item, parseReportPayload(req), files));
})));
