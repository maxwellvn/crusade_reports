import test from "node:test";
import assert from "node:assert/strict";
import { db } from "./db.js";
import { cleanDuplicateReports, duplicateReportPage } from "./duplicateReports.js";

function insertReport({ marker, eventName, city = "Abuja", country = "Nigeria", date = "2026-09-04" }) {
  const reportId = db.prepare(`
    INSERT INTO reports (organization_type, zone, country, contact_name)
    VALUES ('zone', ?, ?, ?)
  `).run(marker, country, `${marker} Reporter`).lastInsertRowid;
  return db.prepare(`
    INSERT INTO crusades (report_id, organization_type, zone, country, event_type, event_name, city, event_date)
    VALUES (?, 'zone', ?, ?, 'mega', ?, ?, ?)
  `).run(reportId, marker, country, eventName, city, date).lastInsertRowid;
}

test("duplicate report page returns only normalized duplicate groups with row pagination", () => {
  const marker = `Duplicate Admin ${Date.now()}`;
  db.exec("BEGIN");
  try {
    const firstId = insertReport({ marker, eventName: `${marker} Alpha` });
    insertReport({ marker, eventName: ` ${marker.toUpperCase()} ALPHA `, city: " abuja ", country: " nigeria " });
    insertReport({ marker, eventName: `${marker} alpha`, city: "ABUJA", country: "NIGERIA" });
    insertReport({ marker, eventName: `${marker} Beta`, city: "Lagos" });
    insertReport({ marker, eventName: `${marker.toUpperCase()} BETA`, city: " lagos " });
    insertReport({ marker, eventName: `${marker} Unique`, city: "Ibadan" });

    const firstPage = duplicateReportPage({ q: marker, page: "1", page_size: "2" });
    const lastPage = duplicateReportPage({ q: marker, page: "3", page_size: "2" });

    assert.equal(firstPage.total, 5);
    assert.equal(firstPage.duplicate_groups, 2);
    assert.equal(firstPage.excess_reports, 3);
    assert.equal(firstPage.rows.length, 2);
    assert.equal(lastPage.rows.length, 1);
    assert.equal(new Set([...firstPage.rows, ...duplicateReportPage({ q: marker, page: "2", page_size: "2" }).rows, ...lastPage.rows].map((row) => row.id)).size, 5);
    const alpha = [...firstPage.rows, ...duplicateReportPage({ q: marker, page: "2", page_size: "2" }).rows, ...lastPage.rows]
      .filter((row) => row.normalized_event_name.endsWith("alpha"));
    assert.equal(alpha.length, 3);
    assert.ok(alpha.every((row) => row.duplicate_count === 3 && row.keeper_id === firstId));
  } finally {
    db.exec("ROLLBACK");
  }
});

test("duplicate report page includes matching reports with blank locations", () => {
  const marker = `Duplicate Blank Location ${Date.now()}`;
  db.exec("BEGIN");
  try {
    insertReport({ marker, eventName: marker, city: "", country: "" });
    insertReport({ marker, eventName: marker, city: "", country: "" });

    const result = duplicateReportPage({ q: marker });

    assert.equal(result.duplicate_groups, 1);
    assert.equal(result.total, 2);
    assert.equal(result.rows.length, 2);
  } finally {
    db.exec("ROLLBACK");
  }
});

test("duplicate report listing is restricted to the super admin", async () => {
  const { crusades } = await import("./routes/crusades.js");
  const route = crusades.stack.find((entry) => entry.route?.path === "/duplicates" && entry.route.methods.get);
  assert.ok(route);
  assert.match(String(route.route.stack[0].handle), /requireSuperAdmin/);
});

function duplicateCleanupFixture(marker) {
  const earliest = insertReport({ marker, eventName: `${marker} Cleanup` });
  const highest = insertReport({ marker, eventName: `${marker} Cleanup` });
  const latest = insertReport({ marker, eventName: `${marker} Cleanup` });
  db.prepare("UPDATE crusades SET attendance = 10 WHERE id = ?").run(earliest);
  db.prepare("UPDATE crusades SET attendance = 500, minister_name = 'Detailed Minister', venue = 'Detailed Venue', registration_item_id = NULL WHERE id = ?").run(highest);
  db.prepare("UPDATE crusades SET attendance = 50 WHERE id = ?").run(latest);
  const highestReportId = db.prepare("SELECT report_id FROM crusades WHERE id = ?").get(highest).report_id;
  db.prepare("UPDATE reports SET contact_email = 'complete@example.test', highlights = 'Verified details', photo_links = 'https://example.test/photo' WHERE id = ?").run(highestReportId);
  return { earliest, highest, latest };
}

for (const [strategy, expectedKey] of [["earliest", "earliest"], ["latest", "latest"], ["highest", "highest"], ["best", "highest"]]) {
  test(`duplicate cleanup can keep the ${strategy} candidate`, () => {
    const marker = `Cleanup ${strategy} ${Date.now()}`;
    db.exec("BEGIN");
    try {
      const ids = duplicateCleanupFixture(marker);
      const result = cleanDuplicateReports(strategy, { q: marker }, 2);
      const remaining = db.prepare("SELECT id FROM crusades WHERE zone = ?").all(marker).map((row) => row.id);

      assert.deepEqual(remaining, [ids[expectedKey]]);
      assert.equal(result.groups_cleaned, 1);
      assert.equal(result.reports_deleted, 2);
      assert.equal(result.strategy, strategy);
    } finally {
      db.exec("ROLLBACK");
    }
  });
}

test("duplicate cleanup rejects an unknown keep strategy", () => {
  assert.throws(() => cleanDuplicateReports("guess", {}), (error) => error.code === "INVALID_STRATEGY");
});

test("duplicate cleanup stops when the confirmed duplicate count is stale", () => {
  const marker = `Cleanup stale ${Date.now()}`;
  db.exec("BEGIN");
  try {
    duplicateCleanupFixture(marker);
    assert.throws(() => cleanDuplicateReports("best", { q: marker }, 1), (error) => error.code === "DUPLICATES_CHANGED");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM crusades WHERE zone = ?").get(marker).n, 3);
  } finally {
    db.exec("ROLLBACK");
  }
});

test("duplicate cleanup endpoint is restricted to the super admin", async () => {
  const { crusades } = await import("./routes/crusades.js");
  const route = crusades.stack.find((entry) => entry.route?.path === "/duplicates/clean" && entry.route.methods.post);
  assert.ok(route);
  assert.match(String(route.route.stack[0].handle), /requireSuperAdmin/);
});
