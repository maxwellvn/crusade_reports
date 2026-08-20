import { Router } from "express";
import { db } from "../db.js";
import { requireSuperAdmin } from "../auth.js";
import { wrap, ApiError } from "../logger.js";
import { backupDatabase } from "../databaseProtection.js";
import { COUNTRIES, resolveCountryName } from "./countries.js";

// Tool for collapsing duplicate / variant country names left behind by bulk
// uploads. Reads are already hardened to normalize on the fly (dashboards can
// never exceed the canonical COUNTRIES list), but the stored values remain
// dirty — this exposes a preview + apply so an admin can rewrite them to the
// canonical name. Write paths also normalize new values going forward.

export const countryConsolidation = Router();

const COUNTRY_SOURCES = [
  { table: "registration_items", column: "country" },
  { table: "registrations", column: "country" },
];

function distinctStoredCountries() {
  const set = new Set();
  for (const { table, column } of COUNTRY_SOURCES) {
    const rows = db.prepare(`SELECT DISTINCT ${column} AS c FROM ${table} WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''`).all();
    for (const row of rows) set.add(row.c);
  }
  return [...set];
}

// Returns the variants that resolve to a canonical country plus any values that
// resolve to nothing (unresolvable) — the two kinds of rows an admin must review.
function analyze() {
  const stored = distinctStoredCountries();
  const canonicalCount = new Set(stored.map((name) => resolveCountryName(name)).filter(Boolean)).size;
  const variantGroups = [];
  const unresolvable = [];
  const byCanonical = new Map();
  for (const name of stored) {
    const canonical = resolveCountryName(name);
    if (!canonical) { unresolvable.push(name); continue; }
    if (canonical === name) continue; // already canonical, nothing to do
    if (!byCanonical.has(canonical)) byCanonical.set(canonical, []);
    byCanonical.get(canonical).push(name);
  }
  for (const [canonical, variants] of byCanonical) {
    variantGroups.push({ canonical, variants, count: variants.length });
  }
  variantGroups.sort((a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical));

  let affectedItems = 0;
  let affectedRegistrations = 0;
  for (const name of stored) {
    const canonical = resolveCountryName(name);
    if (!canonical || canonical === name) continue;
    const itemRows = db.prepare("SELECT COUNT(*) AS n FROM registration_items WHERE country = ?").get(name).n;
    const regRows = db.prepare("SELECT COUNT(*) AS n FROM registrations WHERE country = ?").get(name).n;
    affectedItems += itemRows;
    affectedRegistrations += regRows;
  }

  return {
    canonicalTotal: COUNTRIES.length,
    distinctStored: stored.length,
    canonicalRepresented: canonicalCount,
    resolvableDuplicates: variantGroups.reduce((sum, g) => sum + g.count, 0),
    unresolvable,
    variantGroups,
    affected: { registration_items: affectedItems, registrations: affectedRegistrations },
  };
}

countryConsolidation.get("/", requireSuperAdmin, wrap((_req, res) => {
  res.json(analyze());
}));

countryConsolidation.post("/apply", requireSuperAdmin, wrap(async (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== true) throw new ApiError(422, "CONFIRM_REQUIRED", "Pass confirm: true to apply the consolidation.");

  const analysis = analyze();
  const backup = await backupDatabase("pre-country-consolidation");
  let itemsUpdated = 0;
  let registrationsUpdated = 0;

  db.transaction(() => {
    for (const { table, column } of COUNTRY_SOURCES) {
      const rows = db.prepare(`SELECT DISTINCT ${column} AS c FROM ${table} WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''`).all();
      const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`);
      for (const row of rows) {
        const canonical = resolveCountryName(row.c);
        if (!canonical || canonical === row.c) continue;
        const result = update.run(canonical, row.c);
        if (table === "registration_items") itemsUpdated += result.changes;
        else registrationsUpdated += result.changes;
      }
    }
  })();

  const after = analyze();
  res.json({
    ok: true,
    backup: { name: backup.name, bytes: backup.bytes },
    updated: { registration_items: itemsUpdated, registrations: registrationsUpdated },
    before: analysis,
    after,
  });
}));
