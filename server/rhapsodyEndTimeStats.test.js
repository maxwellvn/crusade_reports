import test from "node:test";
import assert from "node:assert/strict";
import { db } from "./db.js";
import { rhapsodyEndTimeSummary, RHAPSODY_END_TIME_START_DATE } from "./routes/stats.js";
import { isValidHeldDate } from "./validation.js";

function addCrusade(eventDate, suffix) {
  const reportId = db.prepare(`
    INSERT INTO reports (organization_type, zone, country, contact_name)
    VALUES ('zone', ?, 'Nigeria', 'Date Boundary Test')
  `).run(`Date Boundary Zone ${suffix}`).lastInsertRowid;
  db.prepare(`
    INSERT INTO crusades
      (report_id, organization_type, zone, country, event_type, event_name, city, event_date,
       attendance, online_participation, salvation)
    VALUES (?, 'zone', ?, 'Nigeria', 'street', ?, 'Lagos', ?, 20, 5, 3)
  `).run(reportId, `Date Boundary Zone ${suffix}`, `Date Boundary ${suffix}`, eventDate);
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

test("held dates must be real dates that are not in the future", () => {
  assert.equal(isValidHeldDate("2026-09-10", "2026-09-10"), true);
  assert.equal(isValidHeldDate("2026-02-30", "2026-09-10"), false);
  assert.equal(isValidHeldDate("2926-09-14", "2026-09-10"), false);
  assert.equal(isValidHeldDate("8100-08-04", "2026-09-10"), false);
});
