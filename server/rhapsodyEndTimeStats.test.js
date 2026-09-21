import test from "node:test";
import assert from "node:assert/strict";
import { db } from "./db.js";
import { rhapsodyEndTimeSummary, rorDistributedByFormat, rhapsodyDistributedReport, RHAPSODY_END_TIME_START_DATE } from "./routes/stats.js";
import { isValidHeldDate } from "./validation.js";

function addCrusade(eventDate, suffix, { format = "physical", rorDistributed = 0 } = {}) {
  const reportId = db.prepare(`
    INSERT INTO reports (organization_type, zone, country, contact_name)
    VALUES ('zone', ?, 'Nigeria', 'Date Boundary Test')
  `).run(`Date Boundary Zone ${suffix}`).lastInsertRowid;
  db.prepare(`
    INSERT INTO crusades
      (report_id, organization_type, zone, country, event_type, event_name, city, event_date, format,
       attendance, online_participation, salvation, ror_distributed)
    VALUES (?, 'zone', ?, 'Nigeria', 'street', ?, 'Lagos', ?, ?, 20, 5, 3, ?)
  `).run(reportId, `Date Boundary Zone ${suffix}`, `Date Boundary ${suffix}`, eventDate, format, rorDistributed);
}

test("Rhapsody End-Time summary starts after 31 August 2026", () => {
  db.exec("BEGIN");
  try {
    const before = rhapsodyEndTimeSummary();
    addCrusade("2026-08-31", "NOTC");
    addCrusade("2026-09-01", "RETC 1");
    addCrusade("2026-09-03", "RETC 2");
    addCrusade("September 4, 2026", "Malformed date");
    addCrusade("2028-11-01", "Future date");

    const after = rhapsodyEndTimeSummary(db, "2026-09-10");
    assert.equal(RHAPSODY_END_TIME_START_DATE, "2026-09-01");
    assert.equal(after.totals.crusades, before.totals.crusades + 2);
    assert.equal(after.totals.attendance, before.totals.attendance + 40);
    assert.equal(after.totals.online_attendance, before.totals.online_attendance + 10);
    assert.equal(after.totals.salvation, before.totals.salvation + 6);
    assert.equal(after.by_type.find((row) => row.key === "street").crusades >= 2, true);
    assert.equal(after.recent.some((row) => row.event_name === "Date Boundary NOTC"), false);
    assert.equal(after.recent.some((row) => row.event_name === "Date Boundary Malformed date"), false);
    assert.equal(after.recent.some((row) => row.event_name === "Date Boundary Future date"), false);
    assert.equal(after.recent.some((row) => row.event_name === "Date Boundary RETC 2"), true);
  } finally {
    db.exec("ROLLBACK");
  }
});

test("Rhapsody distributed splits physical and online by crusade format", () => {
  db.exec("BEGIN");
  try {
    const beforeEndTime = rhapsodyEndTimeSummary(db, "2026-09-10");
    const beforeAll = rorDistributedByFormat(db);

    addCrusade("2026-09-02", "Physical ROR", { format: "physical", rorDistributed: 400 });
    addCrusade("2026-09-02", "Online ROR", { format: "online", rorDistributed: 150 });
    addCrusade("2026-08-20", "Before window", { format: "physical", rorDistributed: 999 });

    const afterEndTime = rhapsodyEndTimeSummary(db, "2026-09-10");
    assert.equal(afterEndTime.totals.physical, beforeEndTime.totals.physical + 400);
    assert.equal(afterEndTime.totals.online, beforeEndTime.totals.online + 150);
    assert.equal(afterEndTime.totals.total, beforeEndTime.totals.total + 550);

    const afterAll = rorDistributedByFormat(db);
    assert.equal(afterAll.physical, beforeAll.physical + 400 + 999);
    assert.equal(afterAll.online, beforeAll.online + 150);
    assert.equal(afterAll.total, beforeAll.total + 400 + 150 + 999);
  } finally {
    db.exec("ROLLBACK");
  }
});

test("filtered Rhapsody distributed report scopes by zone and format", () => {
  db.exec("BEGIN");
  try {
    addCrusade("2026-09-05", "Zone A physical", { format: "physical", rorDistributed: 200 });
    addCrusade("2026-09-05", "Zone A online", { format: "online", rorDistributed: 80 });
    const reportId = db.prepare(`
      INSERT INTO reports (organization_type, zone, country, contact_name)
      VALUES ('zone', 'Other Zone', 'Nigeria', 'Other')
    `).run().lastInsertRowid;
    db.prepare(`
      INSERT INTO crusades
        (report_id, organization_type, zone, country, event_type, event_name, city, event_date, format,
         attendance, online_participation, salvation, ror_distributed)
      VALUES (?, 'zone', 'Other Zone', 'Nigeria', 'street', 'Other Zone Crusade', 'Lagos', '2026-09-05', 'physical', 10, 0, 1, 500)
    `).run(reportId);

    const zoneOnline = rhapsodyDistributedReport({
      zone: "Date Boundary Zone Zone A online",
      format: "online",
    });
    assert.equal(zoneOnline.summary.online, 80);
    assert.equal(zoneOnline.summary.physical, 0);
    assert.equal(zoneOnline.summary.total, 80);

    const allInZoneFamily = rhapsodyDistributedReport({ zone: "Date Boundary Zone Zone A physical" });
    assert.equal(allInZoneFamily.summary.physical, 200);
    assert.equal(allInZoneFamily.summary.online, 0);
    assert.ok(allInZoneFamily.by_zone.some((row) => row.key === "Date Boundary Zone Zone A physical"));
  } finally {
    db.exec("ROLLBACK");
  }
});

test("held dates must be real dates that are not in the future", () => {
  assert.equal(isValidHeldDate("2026-09-10", "2026-09-10"), true);
  assert.equal(isValidHeldDate("2026-02-30", "2026-09-10"), false);
  assert.equal(isValidHeldDate("2926-09-14", "2026-09-10"), false);
  assert.equal(isValidHeldDate("8100-08-04", "2026-09-10"), false);
});
