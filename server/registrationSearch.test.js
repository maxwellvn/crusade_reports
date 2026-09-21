import test from "node:test";
import assert from "node:assert/strict";
import { db, registrationSearchIndexEnabled } from "./db.js";
import { registrationFilters } from "./routes/registrations.js";

// The FTS-backed search must keep the LIKE semantics: case-insensitive
// substring match on any registration or item field, every word required.
test("registration search finds substrings through the trigram index", () => {
  assert.equal(registrationSearchIndexEnabled, true);
  db.exec("BEGIN");
  try {
    const registrationId = db.prepare(`
      INSERT INTO registrations (organization_type, zone, country, plan_date, contact_name, contact_email)
      VALUES ('zone', 'Zzqtest Zone', 'Nigeria', '2026-08-28', 'Search Tester', 'tester@example.com')
    `).run().lastInsertRowid;
    db.prepare(`
      INSERT INTO registration_items (registration_id, organization_type, zone, country, plan_date, event_type, planned_count, city, venue)
      VALUES (?, 'zone', 'Zzqtest Zone', 'Nigeria', '2026-08-28', 'street', 1, 'Xqvilleburg', 'Old Market')
    `).run(registrationId);

    const count = (q) => {
      const { clause, params } = registrationFilters({ q });
      return db.prepare(`SELECT COUNT(*) AS n FROM registration_items i JOIN registrations r ON r.id = i.registration_id ${clause}`).get(params).n;
    };
    assert.equal(count("QVILLE"), 1); // item field, case-insensitive substring
    assert.equal(count("zzqtest market"), 1); // registration field + item field, all words required
    assert.equal(count("zzqtest nowhere"), 0);
    assert.equal(count("zzqtest ma"), 1); // short token falls back to LIKE
  } finally {
    db.exec("ROLLBACK");
  }
});
