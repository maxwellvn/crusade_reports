import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { collectiveReportData } from "./collectiveReportData.js";
import { buildCollectiveReportPdf, buildCollectiveReportWorkbook } from "./collectiveReportFiles.js";

function fixtureDatabase() {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE registrations (id INTEGER PRIMARY KEY, program TEXT, department TEXT);
    CREATE TABLE registration_items (
      id INTEGER PRIMARY KEY, registration_id INTEGER, program TEXT, organization_type TEXT,
      zone TEXT, group_name TEXT, church_name TEXT, cell_name TEXT, network_name TEXT,
      country TEXT, city TEXT, event_type TEXT, planned_count INTEGER, readiness_status TEXT
    );
    CREATE TABLE reports (id INTEGER PRIMARY KEY);
    CREATE TABLE crusades (
      id INTEGER PRIMARY KEY, report_id INTEGER, registration_item_id INTEGER,
      organization_type TEXT, zone TEXT, group_name TEXT, church_name TEXT, cell_name TEXT,
      network_name TEXT, country TEXT, city TEXT, event_type TEXT, format TEXT,
      attendance INTEGER DEFAULT 0, crusade_expense REAL DEFAULT 0,
      salvation INTEGER DEFAULT 0, holy_spirit_filled INTEGER DEFAULT 0,
      water_baptisms INTEGER DEFAULT 0, ror_distributed INTEGER DEFAULT 0,
      bibles_distributed INTEGER DEFAULT 0, online_participation INTEGER DEFAULT 0,
      radio_tv_reach INTEGER DEFAULT 0, testimonies_recorded INTEGER DEFAULT 0,
      tap2read_distributed INTEGER DEFAULT 0, ntyba_distributed INTEGER DEFAULT 0,
      healing_nations_magazine INTEGER DEFAULT 0, rabah_crusades INTEGER DEFAULT 0,
      rabah_people_reached INTEGER DEFAULT 0
    );
    CREATE TABLE mission_nation_selections (id INTEGER PRIMARY KEY);
    CREATE TABLE media_training_registrations (id INTEGER PRIMARY KEY, church_country_name TEXT, zone_name TEXT);
    CREATE TABLE media_training_trainees (id INTEGER PRIMARY KEY);
    CREATE TABLE mission_trip_volunteers (id INTEGER PRIMARY KEY);
    CREATE TABLE upcoming_crusade_interests (id INTEGER PRIMARY KEY);

    INSERT INTO app_settings VALUES ('mystreamspace_manual_crusades', '5');
    INSERT INTO app_settings VALUES ('mystreamspace_manual_online_attendance', '500');
    INSERT INTO registrations VALUES (1, 'public', NULL), (2, 'public', NULL), (3, 'blue_elite', 'GPD');
    INSERT INTO registration_items VALUES
      (1, 1, 'public', 'zone', 'Lagos Zone 1', NULL, NULL, NULL, NULL, 'Nigeria', 'Lagos', 'mega', 2, 'confirmed'),
      (2, 2, 'public', 'cell', 'Accra Zone', 'Accra Group', 'Accra Church', 'Cell 1', NULL, 'Ghana', 'Accra', 'rabah', 3, 'ready'),
      (3, 3, 'blue_elite', 'cell', NULL, NULL, NULL, 'Staff Cell', NULL, 'Nigeria', 'Abuja', 'rabah', 1, 'confirmed');
    INSERT INTO reports VALUES (1), (2);
    INSERT INTO crusades (id, report_id, registration_item_id, organization_type, zone, country, city, event_type, format, attendance, salvation, holy_spirit_filled, water_baptisms, ror_distributed)
      VALUES (1, 1, 1, 'zone', 'Lagos Zone 1', 'Nigeria', 'Lagos', 'mega', 'physical', 100, 20, 12, 5, 80);
    INSERT INTO crusades (id, report_id, registration_item_id, organization_type, zone, group_name, church_name, cell_name, country, city, event_type, format, online_participation, salvation)
      VALUES (2, 2, 2, 'cell', 'Accra Zone', 'Accra Group', 'Accra Church', 'Cell 1', 'Ghana', 'Accra', 'rabah', 'online', 200, 30);
    INSERT INTO mission_nation_selections VALUES (1);
    INSERT INTO media_training_registrations VALUES (1, 'Nigeria', 'Lagos Zone 1');
    INSERT INTO media_training_trainees VALUES (1), (2);
    INSERT INTO mission_trip_volunteers VALUES (1);
    INSERT INTO upcoming_crusade_interests VALUES (1);
  `);
  return database;
}

test("collective report keeps registrations, held crusades and adjustments distinct", () => {
  const database = fixtureDatabase();
  const data = collectiveReportData(database, new Date("2026-09-08T10:00:00Z"));
  assert.equal(data.headline.total_crusades_registered, 6);
  assert.equal(data.headline.public_crusades_registered, 5);
  assert.equal(data.headline.blue_elite_crusades_registered, 1);
  assert.equal(data.headline.crusades_reported_as_held, 7);
  assert.equal(data.reports.combined_attendance, 800);
  assert.equal(data.reports.salvation, 50);
  assert.equal(data.public_registration.countries, 2);
  assert.equal(data.cellular.registration.crusades, 3);
  assert.equal(data.cellular.reports.crusades, 1);
  assert.equal(data.geography.report_country_count, 2);
  assert.equal(data.geography.report_city_count, 2);
  assert.equal(data.report_initiatives.find((row) => row.key === "mystreamspace").crusades, 5);
  assert.equal(JSON.stringify(data).includes("contact_email"), false);
  database.close();
});

test("collective PDF and e-card workbook open and contain their main sections", async () => {
  const database = fixtureDatabase();
  const data = collectiveReportData(database, new Date("2026-09-08T10:00:00Z"));
  const pdf = await buildCollectiveReportPdf(data);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  const parsedPdf = await getDocument({ data: new Uint8Array(pdf) }).promise;
  assert.ok(parsedPdf.numPages >= 7);
  const firstPage = await parsedPdf.getPage(1);
  const text = (await firstPage.getTextContent()).items.map((item) => item.str).join(" ");
  assert.match(text, /Comprehensive Crusade Report/);

  const xlsx = await buildCollectiveReportWorkbook(data);
  assert.equal(xlsx.subarray(0, 2).toString(), "PK");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx);
  for (const name of ["E-card Figures", "Registration Initiatives", "Report Initiatives", "Registered Countries", "Report Countries", "Registered Continents", "Report Continents"]) {
    assert.ok(workbook.getWorksheet(name), `${name} sheet should exist`);
  }
  const figures = workbook.getWorksheet("E-card Figures");
  assert.equal(figures.getCell("B3").value, "Crusades registered");
  assert.equal(figures.getCell("C3").value, 6);
  database.close();
});
