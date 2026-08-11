import { Router } from "express";
import { db } from "../db.js";
import { requirePageAccess } from "../auth.js";
import { wrap } from "../logger.js";
import { COUNTRIES } from "./countries.js";

export const countryCoverage = Router();

const PUBLIC_PROGRAM_FILTER = "(i.program = 'public' OR i.program IS NULL)";

function getCountriesWithoutRegistrations() {
  const registeredCountries = new Set(
    db.prepare(
      `SELECT DISTINCT country FROM registration_items i WHERE ${PUBLIC_PROGRAM_FILTER} AND country IS NOT NULL`
    ).all().map((row) => row.country)
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
  const rows = db.prepare(`
    SELECT i.country, SUM(i.planned_count) AS crusades, COUNT(DISTINCT i.registration_id) AS registrations
    FROM registration_items i
    WHERE ${PUBLIC_PROGRAM_FILTER} AND i.zone IS NOT NULL AND i.country IS NOT NULL
    GROUP BY i.country
    ORDER BY crusades DESC
  `).all();

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

function getCellCrusadesCountryBreakdown() {
  const countries = db.prepare(`
    SELECT i.country, SUM(i.planned_count) AS crusades, COUNT(DISTINCT i.registration_id) AS registrations
    FROM registration_items i
    WHERE ${PUBLIC_PROGRAM_FILTER}
      AND i.organization_type = 'cell'
      AND i.country IS NOT NULL
    GROUP BY i.country
    ORDER BY crusades DESC, i.country COLLATE NOCASE
  `).all();

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
    SELECT 
      CASE
        WHEN (i.network_name IS NULL OR TRIM(i.network_name) = '')
          AND (LOWER(i.zone) LIKE 'blw%' OR i.event_type = 'youths-aglow') THEN 'Youths Aglow'
        ELSE i.network_name
      END AS network,
      i.country,
      SUM(i.planned_count) AS crusades,
      COUNT(DISTINCT i.registration_id) AS registrations
    FROM registration_items i
    WHERE ${PUBLIC_PROGRAM_FILTER}
      AND i.country IS NOT NULL
      AND ((i.network_name IS NOT NULL AND TRIM(i.network_name) <> '') OR LOWER(i.zone) LIKE 'blw%' OR i.event_type = 'youths-aglow')
    GROUP BY network, i.country
    ORDER BY network COLLATE NOCASE, crusades DESC
  `).all();

  const networkMap = new Map();
  for (const row of rows) {
    if (!networkMap.has(row.network)) {
      networkMap.set(row.network, { network: row.network, countries: [], totalCrusades: 0, totalRegistrations: 0 });
    }
    const network = networkMap.get(row.network);
    network.countries.push({ country: row.country, crusades: row.crusades, registrations: row.registrations });
    network.totalCrusades += row.crusades;
    network.totalRegistrations += row.registrations;
  }

  return [...networkMap.values()].sort((a, b) => b.totalCrusades - a.totalCrusades);
}

countryCoverage.get("/", requirePageAccess("dashboard/country-coverage"), wrap((_req, res) => {
  const unregistered = getCountriesWithoutRegistrations();
  const registered = COUNTRIES.filter((c) => !unregistered.some((u) => u.code === c.code));

  res.json({
    summary: {
      totalCountries: COUNTRIES.length,
      registeredCount: registered.length,
      unregisteredCount: unregistered.length,
    },
    unregisteredByContinent: groupByContinent(unregistered),
    gpdZones: getGpdZonesCountryBreakdown(),
    cellCrusades: getCellCrusadesCountryBreakdown(),
    networks: getNetworkCountryBreakdown(),
  });
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
