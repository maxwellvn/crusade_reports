import { Router } from "express";
import { db } from "../db.js";
import { requirePageAccess } from "../auth.js";
import { wrap } from "../logger.js";
import { COUNTRIES, resolveCountryName } from "./countries.js";
import { coverageData } from "./coverage.js";
import { cachedDashboardData } from "../dashboardCache.js";

export const countryCoverage = Router();

const PUBLIC_PROGRAM_FILTER = "(i.program = 'public' OR i.program IS NULL)";

function countryCoverageData() {
  const unregistered = getCountriesWithoutRegistrations();
  const registered = COUNTRIES.filter((country) => !unregistered.some((item) => item.code === country.code));
  return {
    summary: {
      totalCountries: COUNTRIES.length,
      registeredCount: registered.length,
      unregisteredCount: unregistered.length,
    },
    unregisteredByContinent: groupByContinent(unregistered),
    gpdZones: getGpdZonesCountryBreakdown(),
    cellCrusades: getCellCrusadesCountryBreakdown(),
    networks: getNetworkCountryBreakdown(),
  };
}

export function buildEcardData(countryData, zoneData, generatedAt = new Date()) {
  const groups = [
    countryData.gpdZones,
    countryData.cellCrusades,
    ...countryData.networks.map((network) => ({
      name: network.network,
      countryCount: network.countries.length,
      totalCrusades: network.totalCrusades,
      totalRegistrations: network.totalRegistrations,
      countries: network.countries,
    })),
  ];
  const zonesWithoutRegistrations = zoneData.zones
    .filter((zone) => zone.status === "not_registered")
    .map((zone) => ({ zone: zone.name, region: zone.region }));
  return {
    schema_version: 1,
    generated_at: generatedAt.toISOString(),
    coverage_groups: groups,
    countries: {
      total: countryData.summary.totalCountries,
      registered: countryData.summary.registeredCount,
      without_registrations: countryData.unregisteredByContinent,
    },
    zones: {
      official: zoneData.summary.zones.total,
      registered: zoneData.summary.zones.registered,
      without_registrations: zonesWithoutRegistrations,
    },
  };
}

export function sendEcardDataDownload(res, payload, date = new Date()) {
  const filenameDate = date.toISOString().slice(0, 10);
  const body = JSON.stringify(payload, null, 2);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="notc-ecard-data-${filenameDate}.json"`);
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.setHeader("Cache-Control", "no-store");
  res.send(body);
}

function getCountriesWithoutRegistrations() {
  const registeredCountries = new Set(
    db.prepare(
      `SELECT DISTINCT country FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} AND country IS NOT NULL`
    ).all().map((row) => resolveCountryName(row.country)).filter(Boolean)
  );
  return COUNTRIES.filter((c) => !registeredCountries.has(c.name));
}

function groupByContinent(countries) {
  const grouped = new Map();
  for (const country of countries) {
    const continent = country.continent || "Other";
    if (!grouped.has(continent)) grouped.set(continent, []);
    grouped.get(continent).push(country);
  }
  return [...grouped.entries()]
    .map(([continent, list]) => ({ continent, countries: list.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => {
      if (a.continent === "Other") return 1;
      if (b.continent === "Other") return -1;
      return b.countries.length - a.countries.length || a.continent.localeCompare(b.continent);
    });
}

// Aggregate all zones into a single "GPD Zones" group
function getGpdZonesCountryBreakdown() {
  const raw = db.prepare(`
    SELECT i.country, SUM(i.planned_count) AS crusades, COUNT(DISTINCT i.registration_id) AS registrations
    FROM registration_items i
    WHERE ${PUBLIC_PROGRAM_FILTER} AND i.zone IS NOT NULL AND i.country IS NOT NULL
    GROUP BY i.country
    ORDER BY crusades DESC
  `).all();

  const rows = mergeByCanonicalCountry(raw);
  const totalCrusades = rows.reduce((sum, r) => sum + r.crusades, 0);
  const totalRegistrations = rows.reduce((sum, r) => sum + r.registrations, 0);
  const uniqueCountries = new Set(rows.map((r) => r.country));

  return {
    name: "GPD Zones",
    countryCount: uniqueCountries.size,
    totalCrusades,
    totalRegistrations,
    countries: rows,
  };
}

// Merge raw country-name rows into canonical countries so variant spellings
// collapse into one row (keeps counts capped at the canonical country list).
function mergeByCanonicalCountry(rawRows) {
  const byCanonical = new Map();
  for (const row of rawRows) {
    const key = resolveCountryName(row.country) || row.country;
    const existing = byCanonical.get(key);
    if (existing) {
      existing.crusades += Number(row.crusades);
      existing.registrations += Number(row.registrations);
    } else {
      byCanonical.set(key, { country: key, crusades: Number(row.crusades), registrations: Number(row.registrations) });
    }
  }
  return [...byCanonical.values()].sort((a, b) => Number(b.crusades) - Number(a.crusades) || a.country.localeCompare(b.country));
}

function getCellCrusadesCountryBreakdown() {
  const raw = db.prepare(`
    SELECT i.country, SUM(i.planned_count) AS crusades, COUNT(DISTINCT i.registration_id) AS registrations
    FROM registration_items i
    WHERE ${PUBLIC_PROGRAM_FILTER}
      AND i.organization_type = 'cell'
      AND i.country IS NOT NULL
    GROUP BY i.country
    ORDER BY crusades DESC, i.country COLLATE NOCASE
  `).all();

  const countries = mergeByCanonicalCountry(raw);
  return {
    name: "Cell Crusades",
    countryCount: countries.length,
    totalCrusades: countries.reduce((sum, row) => sum + row.crusades, 0),
    totalRegistrations: countries.reduce((sum, row) => sum + row.registrations, 0),
    countries,
  };
}

function getNetworkCountryBreakdown() {
  const rows = db.prepare(`
    SELECT i.network_name AS network,
      i.country,
      SUM(i.planned_count) AS crusades,
      COUNT(DISTINCT i.registration_id) AS registrations
    FROM registration_items i
    WHERE ${PUBLIC_PROGRAM_FILTER}
      AND i.country IS NOT NULL
      AND i.network_name IS NOT NULL AND TRIM(i.network_name) <> ''
    GROUP BY network, i.country
    ORDER BY network COLLATE NOCASE, crusades DESC
  `).all();

  const networkMap = new Map();
  for (const row of rows) {
    const country = resolveCountryName(row.country) || row.country;
    if (!networkMap.has(row.network)) {
      networkMap.set(row.network, { network: row.network, countries: [], totalCrusades: 0, totalRegistrations: 0 });
    }
    const network = networkMap.get(row.network);
    const existing = network.countries.find((c) => c.country === country);
    if (existing) {
      existing.crusades += Number(row.crusades);
      existing.registrations += Number(row.registrations);
    } else {
      network.countries.push({ country, crusades: Number(row.crusades), registrations: Number(row.registrations) });
    }
    network.totalCrusades += Number(row.crusades);
    network.totalRegistrations += Number(row.registrations);
  }

  return [...networkMap.values()].sort((a, b) => b.totalCrusades - a.totalCrusades);
}

countryCoverage.get("/", requirePageAccess("dashboard/country-coverage"), wrap((_req, res) => {
  res.setHeader("Cache-Control", "private, max-age=30");
  res.json(cachedDashboardData("country-coverage", countryCoverageData));
}));

// Compact, complete source for the locally generated NOTC e-cards. This avoids
// transferring the production SQLite database and keeps every figure aligned
// with the live Country Coverage and Crusade Coverage reports.
countryCoverage.get("/ecard-data", requirePageAccess("dashboard/country-coverage"), wrap(async (_req, res) => {
  const countryData = countryCoverageData();
  const zoneData = await coverageData();
  const payload = buildEcardData(countryData, zoneData);
  sendEcardDataDownload(res, payload);
}));

// CSV export with all data combined
countryCoverage.get("/export", requirePageAccess("dashboard/country-coverage"), wrap((_req, res) => {
  const gpdZones = getGpdZonesCountryBreakdown();
  const cellCrusades = getCellCrusadesCountryBreakdown();
  const networks = getNetworkCountryBreakdown();

  const escapeCSV = (value) => {
    const str = String(value ?? "");
    return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [];

  // Section 1: Summary
  lines.push("=== SUMMARY ===");
  lines.push("Group,Countries,Crusades,Registrations");
  lines.push(`${escapeCSV("GPD Zones")},${gpdZones.countryCount},${gpdZones.totalCrusades},${gpdZones.totalRegistrations}`);
  lines.push(`${escapeCSV("Cell Crusades")},${cellCrusades.countryCount},${cellCrusades.totalCrusades},${cellCrusades.totalRegistrations}`);
  for (const n of networks) {
    lines.push(`${escapeCSV(n.network)},${n.countries.length},${n.totalCrusades},${n.totalRegistrations}`);
  }

  // Section 2: GPD Zones breakdown
  lines.push("");
  lines.push("=== GPD ZONES - COUNTRY BREAKDOWN ===");
  lines.push("Country,Crusades,Registrations");
  for (const c of gpdZones.countries) {
    lines.push(`${escapeCSV(c.country)},${c.crusades},${c.registrations}`);
  }

  lines.push("");
  lines.push("=== CELL CRUSADES - COUNTRY BREAKDOWN ===");
  lines.push("Country,Crusades,Registrations");
  for (const c of cellCrusades.countries) {
    lines.push(`${escapeCSV(c.country)},${c.crusades},${c.registrations}`);
  }

  // Section 3+: Each network breakdown
  for (const n of networks) {
    lines.push("");
    lines.push(`=== ${n.network.toUpperCase()} - COUNTRY BREAKDOWN ===`);
    lines.push("Country,Crusades,Registrations");
    for (const c of n.countries) {
      lines.push(`${escapeCSV(c.country)},${c.crusades},${c.registrations}`);
    }
  }

  const csv = lines.join("\n");
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="country-coverage-breakdown-${date}.csv"`);
  res.send(csv);
}));
