import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

process.env.CRUSADE_DB_PATH = join(tmpdir(), `notc-blw-campus-${randomUUID()}.sqlite`);

const { db } = await import("./db.js");
const { isBlwCampusZone, overviewData, registrationData, reportData } = await import("./routes/blwCampus.js");

const catalog = [
  { region: "Campus Region 1", zone: "BLW TEST CAMPUS ZONE" },
  { region: "Campus Region 2", zone: "BLW EMPTY CAMPUS ZONE" },
];

function addRegistration(zone, eventName, eventType = "mega") {
  const registrationId = db.prepare(`
    INSERT INTO registrations (organization_type, zone, country, plan_date)
    VALUES ('zone', ?, 'Nigeria', '2026-08-28')
  `).run(zone).lastInsertRowid;
  return db.prepare(`
    INSERT INTO registration_items (registration_id, organization_type, zone, country, plan_date,
      event_type, planned_count, event_name, event_date, venue, expected_attendance, city)
    VALUES (?, 'zone', ?, 'Nigeria', '2026-08-28', ?, 1, ?, '2026-08-28', 'Campus Hall', 500, 'Lagos')
  `).run(registrationId, zone, eventType, eventName).lastInsertRowid;
}

function addReport(zone, itemId = null) {
  const reportId = db.prepare(`
    INSERT INTO reports (organization_type, zone, country) VALUES ('zone', ?, 'Nigeria')
  `).run(zone).lastInsertRowid;
  db.prepare(`
    INSERT INTO crusades (report_id, organization_type, zone, country, event_type, event_name,
      city, event_date, attendance, salvation, ror_distributed, registration_item_id)
    VALUES (?, 'zone', ?, 'Nigeria', 'mega', 'BLW Campus Report', 'Lagos', '2026-08-28', 420, 75, 120, ?)
  `).run(reportId, zone, itemId);
}

test("BLW Campus scope follows the established BLW zone prefix", () => {
  assert.equal(isBlwCampusZone("BLW Lagos Campus"), true);
  assert.equal(isBlwCampusZone("  blw test zone"), true);
  assert.equal(isBlwCampusZone("Lagos Zone 1"), false);
});

test("BLW Campus data combines registrations, reports, and inactive directory zones", async () => {
  const itemId = addRegistration("BLW TEST CAMPUS ZONE", "BLW Campus Mega");
  addRegistration("BLW TEST CAMPUS ZONE", "BLW Campus Online", "online");
  addRegistration("NON BLW ZONE", "Unrelated Crusade");
  addReport("BLW TEST CAMPUS ZONE", itemId);
  addReport("NON BLW ZONE");

  const overview = await overviewData({}, catalog);
  assert.deepEqual(overview.summary, {
    campus_regions: 2,
    campus_zones: 2,
    zones_with_registrations: 1,
    registered_crusades: 2,
    registration_entries: 2,
    reports_submitted: 1,
    attendance: 420,
    souls_won: 75,
    rhapsody_distributed: 120,
  });
  assert.equal(overview.zones.find((row) => row.zone === "BLW EMPTY CAMPUS ZONE").registered_crusades, 0);

  const registrations = await registrationData({ q: "Online" }, true, catalog);
  assert.equal(registrations.total, 1);
  assert.equal(registrations.rows[0].event_name, "BLW Campus Online");
  assert.equal("contact_email" in registrations.rows[0], false);

  const reports = await reportData({ region: "Campus Region 1" }, true, catalog);
  assert.equal(reports.total, 1);
  assert.equal(reports.rows[0].attendance, 420);
  assert.equal("contact_name" in reports.rows[0], false);
});
