import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { wrap, ApiError } from "../logger.js";
import { requireAdmin } from "../auth.js";
import { loadZones } from "./zones.js";

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

// GET /api/zone-portal/:token — everything the zone dashboard shows. Every query
// is scoped to the token's zone; there is no way to reach another zone's rows.
zonePortal.get("/zone-portal/:token", wrap((req, res) => {
  const row = db.prepare("SELECT zone AS name, kind FROM zone_tokens WHERE token = ?").get(req.params.token);
  if (!row) throw new ApiError(404, "NOT_FOUND", "This link is not valid — ask your coordinator for a new one.");
  const { name, kind } = row;
  const col = kind === "network" ? "network_name" : "zone"; // fixed string, never user input

  const registrations = db.prepare(`
    SELECT r.id, r.created_at, r.organization_type, r.group_name, r.church_name, r.country, r.plan_date,
           COALESCE(SUM(i.planned_count), 0) AS planned
    FROM registrations r LEFT JOIN registration_items i ON i.registration_id = r.id
    WHERE r.${col} = ? GROUP BY r.id ORDER BY r.created_at DESC LIMIT 500
  `).all(name);

  const items = db.prepare(`
    SELECT registration_id, event_type, planned_count, city
    FROM registration_items WHERE ${col} = ? ORDER BY planned_count DESC
  `).all(name);

  const crusades = db.prepare(`
    SELECT id, event_date, event_type, other_event_type, event_name, format, city, country,
           group_name, church_name, attendance, online_participation, salvation, minister_name, venue
    FROM crusades WHERE ${col} = ? ORDER BY event_date DESC, id DESC LIMIT 500
  `).all(name);

  const totals = {
    planned: db.prepare(`SELECT COALESCE(SUM(planned_count),0) n FROM registration_items WHERE ${col} = ?`).get(name).n,
    held: db.prepare(`SELECT COUNT(*) n FROM crusades WHERE ${col} = ?`).get(name).n,
    attendance: db.prepare(`SELECT COALESCE(SUM(attendance + online_participation),0) n FROM crusades WHERE ${col} = ?`).get(name).n,
    salvation: db.prepare(`SELECT COALESCE(SUM(salvation),0) n FROM crusades WHERE ${col} = ?`).get(name).n,
  };

  res.json({ zone: name, kind, totals, registrations, items, crusades });
}));
