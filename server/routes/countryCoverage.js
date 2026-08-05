import { Router } from "express";
import { db } from "../db.js";
import { requireSuperAdmin } from "../auth.js";
import { wrap } from "../logger.js";
import { COUNTRIES } from "./countries.js";
import { continentForCode } from "../countryContinents.js";
import ExcelJS from "exceljs";

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

countryCoverage.get("/", requireSuperAdmin, wrap((_req, res) => {
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
    networks: getNetworkCountryBreakdown(),
  });
}));

// Multi-sheet Excel export
countryCoverage.get("/export", requireSuperAdmin, wrap(async (_req, res) => {
  const gpdZones = getGpdZonesCountryBreakdown();
  const networks = getNetworkCountryBreakdown();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Crusade Reports";
  workbook.created = new Date();

  // Sheet 1: Summary
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Group", key: "group", width: 30 },
    { header: "Countries", key: "countries", width: 15 },
    { header: "Crusades", key: "crusades", width: 15 },
    { header: "Registrations", key: "registrations", width: 15 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  summarySheet.addRow({ group: "GPD Zones", countries: gpdZones.countryCount, crusades: gpdZones.totalCrusades, registrations: gpdZones.totalRegistrations });
  for (const n of networks) {
    summarySheet.addRow({ group: n.network, countries: n.countries.length, crusades: n.totalCrusades, registrations: n.totalRegistrations });
  }

  // Sheet 2: GPD Zones countries
  const gpdSheet = workbook.addWorksheet("GPD Zones");
  gpdSheet.columns = [
    { header: "Country", key: "country", width: 30 },
    { header: "Crusades", key: "crusades", width: 15 },
    { header: "Registrations", key: "registrations", width: 15 },
  ];
  gpdSheet.getRow(1).font = { bold: true };
  for (const c of gpdZones.countries) {
    gpdSheet.addRow({ country: c.country, crusades: c.crusades, registrations: c.registrations });
  }

  // Sheet 3+: Each network
  for (const n of networks) {
    const sheetName = n.network.slice(0, 31).replace(/[*?:/\\[\]]/g, "");
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = [
      { header: "Country", key: "country", width: 30 },
      { header: "Crusades", key: "crusades", width: 15 },
      { header: "Registrations", key: "registrations", width: 15 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const c of n.countries) {
      sheet.addRow({ country: c.country, crusades: c.crusades, registrations: c.registrations });
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="country-coverage-breakdown-${date}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}));
