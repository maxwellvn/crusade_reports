import { Router } from "express";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { logger, wrap, ApiError } from "../logger.js";

export const zones = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, "..", "..", "data", "zones_cache.json");
const TTL_MS = 60 * 60 * 1000; // 1h

let cache = { at: 0, data: null };

// Upstream shape: { "Region N": { "Zone Name": { name, groups } } } where groups
// is EITHER an array of {name,id} OR an object keyed by number. Normalize to a
// flat list of { region, zone, groups: [{name,id}] }.
// ponytail: upstream is irregular — some region entries are themselves zone-shaped
// (name+groups at region level, e.g. "Other Regions") and carry metadata keys like
// _updated_at. Emit the region-as-zone too, and skip its own name/groups fields.
function toGroups(groupsRaw) {
  const list = Array.isArray(groupsRaw) ? groupsRaw
    : groupsRaw && typeof groupsRaw === "object" ? Object.values(groupsRaw) : [];
  // Uppercase = the one canonical casing for zone/group names across the app.
  return list.filter((g) => g && g.name).map((g) => ({ name: String(g.name).toUpperCase(), id: g.id ? String(g.id) : String(g.name) }));
}
// ponytail: leftover test/placeholder zones from the upstream admin tool. Denylist
// by exact name — move to a config/env list if upstream keeps adding junk.
const JUNK_ZONES = new Set(["new", "new zone", "zone a", "zone b"]);

function normalize(raw) {
  const out = [];
  const pushZone = (region, z) => {
    if (!z || typeof z !== "object" || !z.name) return;
    if (JUNK_ZONES.has(String(z.name).trim().toLowerCase())) return;
    out.push({ region: String(region), zone: String(z.name).toUpperCase(), groups: toGroups(z.groups) });
  };
  for (const [region, regionZones] of Object.entries(raw || {})) {
    if (!regionZones || typeof regionZones !== "object") continue;
    if (typeof regionZones.name === "string") pushZone(region, regionZones); // region acting as a zone
    for (const [key, zone] of Object.entries(regionZones)) {
      if (key === "name" || key === "groups") continue; // region's own fields, handled above
      pushZone(region, zone);
    }
  }
  return out.sort((a, b) => a.zone.localeCompare(b.zone));
}

async function load() {
  const now = Date.now();
  if (cache.data && now - cache.at < TTL_MS) return cache.data;

  const url = process.env.ZONES_URL;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`upstream ${resp.status}`);
    const data = normalize(await resp.json());
    if (!data.length) throw new Error("empty after normalize");
    cache = { at: now, data };
    writeFile(CACHE_FILE, JSON.stringify(data)).catch(() => {}); // best-effort fallback snapshot
    return data;
  } catch (err) {
    logger.warn({ err }, "zones fetch failed — trying cache file");
    if (cache.data) return cache.data;
    try {
      const disk = JSON.parse(await readFile(CACHE_FILE, "utf8"));
      cache = { at: now, data: disk };
      return disk;
    } catch {
      throw new ApiError(503, "ZONES_UNAVAILABLE", "Zones list is temporarily unavailable");
    }
  }
}

// Exposed so the importer can validate/canonicalize zone & group names on upload.
export const loadZones = load;

zones.get("/", wrap(async (_req, res) => {
  const data = await load();
  // zones only (groups fetched via the zone-scoped endpoint to keep payloads small)
  res.json(data.map(({ region, zone }) => ({ region, zone })));
}));

zones.get("/groups", wrap(async (req, res) => {
  const zoneName = String(req.query.zone || "").trim();
  if (!zoneName) throw new ApiError(400, "BAD_REQUEST", "zone query param is required");
  const data = await load();
  const match = data.find((z) => z.zone === zoneName);
  res.json(match ? match.groups : []);
}));
