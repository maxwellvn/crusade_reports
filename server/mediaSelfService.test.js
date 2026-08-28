import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

process.env.CRUSADE_DB_PATH = join(tmpdir(), `notc-media-self-service-${randomUUID()}.sqlite`);

const { db } = await import("./db.js");
const { findCrusadesForLookup, normalizeCrusadeLookup } = await import("./routes/registrations.js");
const { mediaReportRequest } = await import("./routes/reports.js");

test("public crusade lookup matches email or KingsChat and returns no personal fields", () => {
  const registrationId = db.prepare(`
    INSERT INTO registrations (organization_type, zone, country, plan_date, contact_name, contact_email, phone_number, kingschat_username)
    VALUES ('zone', 'Test Zone', 'Nigeria', '2026-08-28', 'Private Person', 'Person@Example.com', '08000000000', '@PrivateHandle')
  `).run().lastInsertRowid;
  const itemId = db.prepare(`
    INSERT INTO registration_items (registration_id, organization_type, zone, country, plan_date, event_type, planned_count,
      event_name, event_date, venue, expected_attendance, minister_name, city)
    VALUES (?, 'zone', 'Test Zone', 'Nigeria', '2026-08-28', 'mega', 1,
      'Test Crusade', '2026-08-28', 'Test Venue', 1000, 'Test Minister', 'Lagos')
  `).run(registrationId).lastInsertRowid;

  for (const lookup of ["person@example.com", "@privatehandle"]) {
    const rows = findCrusadesForLookup(lookup);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, itemId);
    assert.deepEqual(Object.keys(rows[0]).sort(), [
      "city", "country", "event_date", "event_name", "event_type", "id", "other_event_type",
      "readiness_status", "report_crusade_id", "report_id", "reported_at", "venue",
    ].sort());
    assert.equal(JSON.stringify(rows).includes("Private Person"), false);
    assert.equal(JSON.stringify(rows).includes("Person@Example.com"), false);
    assert.equal(JSON.stringify(rows).includes("08000000000"), false);
    assert.equal(JSON.stringify(rows).includes("PrivateHandle"), false);
  }
  assert.deepEqual(findCrusadesForLookup("someone-else"), []);
});

test("lookup normalization accepts a KingsChat @ prefix", () => {
  assert.equal(normalizeCrusadeLookup("  @ExampleUser  "), "exampleuser");
});

test("media report filters keep crusade and review filters parameterized", () => {
  const request = mediaReportRequest({ event_type: "mega", country: "Nigeria", review_status: "follow_up", q: "Lagos" });
  assert.match(request.clause, /EXISTS \(SELECT 1 FROM crusades c/);
  assert.match(request.clause, /COALESCE\(rv\.status, 'new'\)/);
  assert.equal(request.params.event_type, "mega");
  assert.equal(request.params.country, "Nigeria");
  assert.equal(request.params.review_status, "follow_up");
  assert.equal(request.params.q, "%Lagos%");
});
