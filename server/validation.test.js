import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { confirmationSchema, portalCrusadeReportSchema, registrationCrusadeEditSchema, registrationSchema, reportSchema } from "./validation.js";
import { isSuperAdminUsername, lookupKingsChatUser, normalizeKingsChatUsername, requireSuperAdmin, SUPER_ADMIN_USERNAME } from "./auth.js";
import { db } from "./db.js";
import { registrationProgress } from "./routes/stats.js";
import { ensureReportingOpen, isReportingOpen, setReportingOpen } from "./appSettings.js";
import { applyPortalScope } from "./portalScope.js";

test("not holding requires feedback while other statuses do not", () => {
  assert.equal(confirmationSchema.safeParse({ status: "not_holding", feedback: "" }).success, false);
  assert.equal(confirmationSchema.safeParse({ status: "not_holding", feedback: "Venue unavailable" }).success, true);
  assert.equal(confirmationSchema.safeParse({ status: "holding" }).success, true);
  assert.equal(confirmationSchema.safeParse({ status: "held" }).success, false);
  assert.equal(confirmationSchema.safeParse({ status: "pending" }).success, true);
  assert.equal(confirmationSchema.safeParse({ status: "ready", feedback: "Venue and team confirmed" }).success, true);
});

test("dashboard edits require full crusade details and expected attendance", () => {
  const edit = {
    event_type: "mega", event_name: "City Mega Crusade", event_date: "2026-07-21",
    venue: "National Stadium", expected_attendance: 5000, minister_name: "Pastor Test", city: "Lagos",
    status: "pending", feedback: "Awaiting final confirmation",
  };
  assert.equal(registrationCrusadeEditSchema.safeParse(edit).success, true);
  assert.equal(registrationCrusadeEditSchema.safeParse({ ...edit, status: "held" }).success, false);
  assert.equal(registrationCrusadeEditSchema.safeParse({ ...edit, expected_attendance: 0 }).success, false);
  assert.equal(registrationCrusadeEditSchema.safeParse({ ...edit, minister_name: "" }).success, false);
});

test("each new registration item requires individual crusade details", () => {
  const base = {
    organization_type: "zone", zone: "Test Zone", country: "Nigeria",
    contact_name: "Test Coordinator", contact_email: "test@example.com",
    phone_country_code: "+234", phone_number: "801 234 5678",
  };
  assert.equal(registrationSchema.safeParse({ ...base, items: [{ event_type: "street", city: "Lagos" }] }).success, false);
  assert.equal(registrationSchema.safeParse({ ...base, items: [{
    event_type: "street", event_name: "Test Street Crusade", event_date: "2026-07-20",
    venue: "Test Square", expected_attendance: 500, city: "Lagos",
  }] }).success, true);
});

test("private dashboard report validates one complete registered crusade outcome", () => {
  const crusade = {
    format: "physical", event_type: "street", event_name: "Lagos Street Crusade", city: "Lagos",
    city_place_id: "place-1", event_date: "2026-07-20", attendance: 450, minister_name: "Pastor Test",
    venue: "Test Square", salvation: 25,
  };
  assert.equal(portalCrusadeReportSchema.safeParse({ crusade }).success, true);
  assert.equal(portalCrusadeReportSchema.safeParse({ crusade: { ...crusade, minister_name: "" } }).success, false);
});

test("cell reports retain the full zone hierarchy", () => {
  const report = {
    organization_type: "cell", zone: "Lagos Zone 1", group_name: "Lekki Group",
    church_name: "Christ Embassy Lekki", cell_name: "Victory Cell", country: "Nigeria",
    contact_name: "Test Coordinator", contact_email: "test@example.com",
    phone_country_code: "+234", phone_number: "801 234 5678",
    crusades: [{ format: "physical", event_type: "street", event_name: "Victory Reach", city: "Lagos",
      event_date: "2026-07-20", attendance: 50, minister_name: "Pastor Test", venue: "Community Hall" }],
  };
  assert.equal(reportSchema.safeParse(report).success, true);
  assert.equal(reportSchema.safeParse({ ...report, cell_name: "" }).success, false);
});

test("KingsChat access usernames normalize consistently", () => {
  assert.equal(normalizeKingsChatUsername("  @MaxwellVN "), "maxwellvn");
  assert.equal(normalizeKingsChatUsername("Another.User"), "another.user");
});

test("only maxwellvn is recognized as the super admin", () => {
  assert.equal(SUPER_ADMIN_USERNAME, "maxwellvn");
  assert.equal(isSuperAdminUsername(" @MaxwellVN "), true);
  assert.equal(isSuperAdminUsername("another.admin"), false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dashboard_accounts WHERE username = 'maxwellvn' COLLATE NOCASE").get().n, 1);
});

test("account management middleware rejects every approved user except maxwellvn", async () => {
  const originalFetch = global.fetch;
  db.exec("BEGIN");
  try {
    db.prepare("INSERT OR IGNORE INTO dashboard_accounts (username, created_by) VALUES ('ordinary.admin', 'test')").run();
    global.fetch = async (_url, options) => ({
      ok: true,
      json: async () => ({ profile: { user: { username: options.headers.Authorization.endsWith("super-token") ? "maxwellvn" : "ordinary.admin" } } }),
    });
    const run = (token) => new Promise((resolve) => requireSuperAdmin({
      headers: {},
      get: (name) => name === "authorization" ? `Bearer ${token}` : "",
    }, {}, (error) => resolve(error)));

    const denied = await run("ordinary-token");
    assert.equal(denied?.code, "SUPER_ADMIN_REQUIRED");
    assert.equal(await run("super-token"), undefined);
  } finally {
    global.fetch = originalFetch;
    db.exec("ROLLBACK");
  }
});

test("KingsChat lookup uses the signed-in profile and contacts fallback", async () => {
  let calls = 0;
  const originalFetch = global.fetch;
  try {
    const self = await lookupKingsChatUser("unused", "maxwellvn", { username: "MaxwellVN", name: "Maxwell" });
    assert.deepEqual(self, { username: "maxwellvn", name: "Maxwell", user_id: "" });

    global.fetch = async (url) => {
      calls++;
      if (url.includes("?username=")) return { ok: false, status: 401 };
      return { ok: true, json: async () => ({ contacts: [{ id: "kc-1", username: "kingsblast", name: "Kings Blast" }] }) };
    };
    const contact = await lookupKingsChatUser("token", "@KingsBlast");
    assert.deepEqual(contact, { username: "kingsblast", name: "Kings Blast", user_id: "kc-1" });
    assert.equal(calls, 2);

    global.fetch = async (url) => {
      calls++;
      if (url.includes("?username=")) return { ok: false, status: 404 };
      if (url.includes("/api/contacts")) return { ok: true, json: async () => ({ contacts: [] }) };
      return { ok: true, text: async () => '<h1 class="visually-hidden">Follow KingsBlast - @kingsblast on KingsChat - The Christian Social Media App</h1>' };
    };
    const publicProfile = await lookupKingsChatUser("token", "kingsblast");
    assert.deepEqual(publicProfile, { username: "kingsblast", name: "KingsBlast", user_id: "" });
    assert.equal(calls, 5);
  } finally {
    global.fetch = originalFetch;
  }
});

test("dashboard layout storage accepts the live registrations scope", () => {
  db.exec("BEGIN");
  try {
    db.prepare("INSERT OR REPLACE INTO dashboard_layout (id, layout) VALUES (2, '[]')").run();
    assert.equal(db.prepare("SELECT layout FROM dashboard_layout WHERE id = 2").get().layout, "[]");
  } finally {
    db.exec("ROLLBACK");
  }
});

test("legacy databases add registration_item_id before cell backfill", async () => {
  const dir = mkdtempSync(join(tmpdir(), "crusade-db-migration-"));
  const path = join(dir, "legacy.sqlite");
  try {
    await db.backup(path);
    const legacy = new Database(path);
    legacy.exec("DROP INDEX IF EXISTS idx_crusades_registration_item");
    legacy.exec("ALTER TABLE crusades DROP COLUMN registration_item_id");
    legacy.close();

    const script = `await import(${JSON.stringify(new URL("./db.js", import.meta.url).href)})`;
    const migrated = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, CRUSADE_DB_PATH: path }, encoding: "utf8",
    });
    assert.equal(migrated.status, 0, migrated.stderr);
    const checked = new Database(path, { readonly: true });
    assert.equal(checked.prepare("PRAGMA table_info(crusades)").all().some((column) => column.name === "registration_item_id"), true);
    checked.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("planned versus held counts only reports linked to registered crusades", () => {
  const marker = `Dashboard alignment ${Date.now()}`;
  db.exec("BEGIN");
  try {
    const registrationId = db.prepare(
      `INSERT INTO registrations (organization_type, zone, country, plan_date) VALUES ('zone', ?, 'Nigeria', '2026-08-01')`
    ).run(marker).lastInsertRowid;
    const insertItem = db.prepare(
      `INSERT INTO registration_items
       (registration_id, organization_type, zone, country, plan_date, event_type, planned_count, event_name, event_date, venue, expected_attendance, city)
       VALUES (?, 'zone', ?, 'Nigeria', '2026-08-01', 'mega', 1, ?, '2026-08-01', 'Test venue', 1000, 'Lagos')`
    );
    const heldItemId = insertItem.run(registrationId, marker, `${marker} held`).lastInsertRowid;
    insertItem.run(registrationId, marker, `${marker} awaiting`);
    const reportId = db.prepare("INSERT INTO reports (organization_type, zone, country) VALUES ('zone', ?, 'Nigeria')").run(marker).lastInsertRowid;
    db.prepare(
      `INSERT INTO crusades (report_id, organization_type, zone, country, event_type, city, event_date, registration_item_id)
       VALUES (?, 'zone', ?, 'Nigeria', 'mega', 'Lagos', '2026-08-01', ?)`
    ).run(reportId, marker, heldItemId);
    db.prepare(
      `INSERT INTO crusades (report_id, organization_type, zone, country, event_type, city, event_date)
       VALUES (?, 'zone', ?, 'Nigeria', 'mega', 'Lagos', '2026-08-01')`
    ).run(reportId, marker);

    const row = registrationProgress("zone").find((item) => item.key === marker);
    assert.deepEqual({ planned: row.planned, items: row.items, held: row.held }, { planned: 2, items: 2, held: 1 });
  } finally {
    db.exec("ROLLBACK");
  }
});

test("reporting access can be closed and is enforced server-side", () => {
  db.exec("BEGIN");
  try {
    setReportingOpen(false);
    assert.equal(isReportingOpen(), false);
    assert.throws(ensureReportingOpen, (error) => error.code === "REPORTING_CLOSED" && error.status === 403);
    setReportingOpen(true);
    assert.doesNotThrow(ensureReportingOpen);
  } finally {
    db.exec("ROLLBACK");
  }
});

test("private dashboard tokens lock submissions to their zone or network", () => {
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO zone_tokens (zone, token, kind) VALUES ('Test Network', 'scope-test-token', 'network')").run();
    const scoped = applyPortalScope({ organization_type: "zone", zone: "Wrong Zone", network_name: "" }, "scope-test-token");
    assert.equal(scoped.organization_type, "network");
    assert.equal(scoped.network_name, "Test Network");
    assert.equal(scoped.zone, "");
  } finally {
    db.exec("ROLLBACK");
  }
});
