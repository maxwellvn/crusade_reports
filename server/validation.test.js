import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { confirmationSchema, mediaTrainingRegistrationSchema, missionNationSelectionSchema, portalCrusadeReportSchema, registrationCrusadeEditSchema, registrationSchema, reportSchema } from "./validation.js";
import { isSuperAdminUsername, lookupKingsChatUser, normalizeKingsChatUsername, requireSuperAdmin, SUPER_ADMIN_USERNAME } from "./auth.js";
import { db } from "./db.js";
import { registrationProgress } from "./routes/stats.js";
import { deleteCrusadeReport } from "./routes/crusades.js";
import { deleteRegistrationCrusade, updateRegistrationCrusade } from "./routes/registrations.js";
import { ensureReportingOpen, isReportingOpen, setReportingOpen } from "./appSettings.js";
import { applyPortalScope } from "./portalScope.js";
import { COUNTRIES } from "./routes/countries.js";
import { adminSelectionQuery } from "./routes/missionNations.js";
import { mediaTrainingRows } from "./routes/mediaTraining.js";

test("media training accepts an individual trainee and supports admin filtering", () => {
  const registration = {
    zone_name: "Lagos Zone 1", group_name: "Lekki Group", church_name: "Christ Embassy Lekki", full_name: "Ada Example",
    role: "Presenter", email: "ada@example.com", kingschat_username: "ada", phone_country_code: "+234", phone_number: "8012345678",
  };
  assert.equal(mediaTrainingRegistrationSchema.safeParse(registration).success, true);
  assert.equal(mediaTrainingRegistrationSchema.safeParse({ ...registration, group_name: "", church_name: "" }).success, true);
  assert.equal(mediaTrainingRegistrationSchema.safeParse({ ...registration, zone_name: "" }).success, false);
  assert.equal(mediaTrainingRegistrationSchema.safeParse({ ...registration, full_name: "" }).success, false);
  db.exec("BEGIN");
  try {
    const id = db.prepare("INSERT INTO media_training_registrations (reference_code, zone_name, group_name, church_name, organization_name, primary_timezone) VALUES ('GMT-TEST-1', ?, ?, ?, ?, '')").run(registration.zone_name, registration.group_name, registration.church_name, registration.church_name).lastInsertRowid;
    const insert = db.prepare("INSERT INTO media_training_trainees (registration_id, full_name, role, email, kingschat_username, phone_country_code, phone_number) VALUES (?, ?, ?, ?, ?, ?, ?)");
    insert.run(id, registration.full_name, registration.role, registration.email, registration.kingschat_username, registration.phone_country_code, registration.phone_number);
    assert.deepEqual(mediaTrainingRows({ role: "Presenter" }).map((row) => row.full_name), ["Ada Example"]);
    assert.deepEqual(mediaTrainingRows({ zone: "Lagos Zone 1" }).map((row) => row.full_name), ["Ada Example"]);
    assert.deepEqual(mediaTrainingRows({ q: "Ada Example" }).map((row) => row.role), ["Presenter"]);
  } finally { db.exec("ROLLBACK"); }
});

test("mission nation catalogue contains 242 nations and rejects home-nation selection", () => {
  assert.equal(COUNTRIES.length, 242);
  assert.equal(COUNTRIES.some((country) => !country.continent || country.continent === "Other"), false);
  assert.deepEqual([...new Set(COUNTRIES.map((country) => country.continent))].sort(), ["Africa", "Asia", "Europe", "North America", "Oceania", "South America"]);
  const selection = {
    pastor_name: "Pastor Test", zone_name: "Test Zone", home_country_code: "NG",
    mission_country_code: "GH", contact_email: "pastor@example.com", phone_country_code: "+234",
    phone_number: "8012345678", kingschat_username: "pastor.test",
  };
  assert.equal(missionNationSelectionSchema.safeParse(selection).success, true);
  assert.equal(missionNationSelectionSchema.safeParse({ ...selection, mission_country_code: "NG" }).success, false);
});

test("each zone submits once while multiple zones may prefer the same nation", () => {
  db.exec("BEGIN");
  try {
    const insert = db.prepare(`INSERT INTO mission_nation_selections
      (receipt_code, pastor_name, zone_name, home_country_code, home_country_name, mission_country_code,
       mission_country_name, contact_email, phone_country_code, phone_number, kingschat_username)
      VALUES (?, 'Pastor Test', ?, 'NG', 'Nigeria', ?, ?, 'pastor@example.com', '+234', '8012345678', 'pastor.test')`);
    insert.run("MN-TEST-1", "MISSION TEST ZONE", "GH", "Ghana");
    assert.throws(() => insert.run("MN-TEST-2", "MISSION TEST ZONE", "KE", "Kenya"), /UNIQUE/);
    assert.doesNotThrow(() => insert.run("MN-TEST-3", "ANOTHER TEST ZONE", "GH", "Ghana"));
  } finally {
    db.exec("ROLLBACK");
  }
});

test("mission nation admin filters and sorting are server constrained", () => {
  db.exec("BEGIN");
  try {
    const insert = db.prepare(`INSERT INTO mission_nation_selections
      (receipt_code, pastor_name, zone_name, home_country_code, home_country_name, mission_country_code,
       mission_country_name, contact_email, phone_country_code, phone_number, kingschat_username, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '+234', '8012345678', ?, ?)`);
    insert.run("MN-FILTER-1", "Pastor Alpha", "FILTER ZONE A", "NG", "Nigeria", "GH", "Ghana", "alpha@example.com", "alpha", "2026-07-01 10:00:00");
    insert.run("MN-FILTER-2", "Pastor Beta", "FILTER ZONE B", "ZA", "South Africa", "KE", "Kenya", "beta@example.com", "beta", "2026-07-02 10:00:00");
    db.prepare("UPDATE mission_nation_selections SET assigned_country_code = 'US', assigned_country_name = 'United States' WHERE receipt_code = 'MN-FILTER-1'").run();
    assert.deepEqual(adminSelectionQuery({ mission_country: "GH" }).map((row) => row.receipt_code), ["MN-FILTER-1"]);
    assert.deepEqual(adminSelectionQuery({ assigned_country: "US" }).map((row) => row.receipt_code), ["MN-FILTER-1"]);
    assert.deepEqual(adminSelectionQuery({ q: "United States" }).map((row) => row.receipt_code), ["MN-FILTER-1"]);
    assert.deepEqual(adminSelectionQuery({ zone: "FILTER ZONE B" }).map((row) => row.receipt_code), ["MN-FILTER-2"]);
    assert.deepEqual(adminSelectionQuery({ q: "MN-FILTER", date_from: "2026-07-02", sort: "mission_nation", direction: "asc" }).map((row) => row.receipt_code), ["MN-FILTER-2"]);
  } finally {
    db.exec("ROLLBACK");
  }
});

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
    organization_type: "zone", zone: "Test Zone",
    contact_name: "Test Coordinator", contact_email: "test@example.com",
    phone_country_code: "+234", phone_number: "801 234 5678",
  };
  assert.equal(registrationSchema.safeParse({ ...base, items: [{ event_type: "street", city: "Lagos" }] }).success, false);
  const item = {
    event_type: "street", event_name: "Test Street Crusade", event_date: "2026-07-20",
    venue: "Test Square", expected_attendance: 500, country: "Nigeria", city: "Lagos", minister_name: "Pastor Test",
  };
  assert.equal(registrationSchema.safeParse({ ...base, items: [item] }).success, true);
  // country is per crusade now — a missing country fails validation
  assert.equal(registrationSchema.safeParse({ ...base, items: [{ ...item, country: "" }] }).success, false);
  assert.equal(registrationSchema.safeParse({ ...base, items: [{ ...item, minister_name: "" }] }).success, false);
});

test("network planning edits lock once the crusade date has passed", () => {
  db.exec("BEGIN");
  try {
    const reg = db.prepare(
      `INSERT INTO registrations (organization_type, network_name, country, plan_date) VALUES ('network', 'REON', 'Nigeria', '2020-01-01')`
    ).run().lastInsertRowid;
    const makeItem = (date) => db.prepare(
      `INSERT INTO registration_items
       (registration_id, organization_type, network_name, country, plan_date, event_type, planned_count, event_name, event_date, venue, expected_attendance, city,
        crusade_collaborators, zone_contribution, estimated_budget, permits_obtained)
       VALUES (?, 'network', 'REON', 'Nigeria', ?, 'street', 1, 'Original', ?, 'Original Venue', 100, 'Lagos', 'REON', 'Sending Pastors', '1000', 'No')`
    ).run(reg, date, date).lastInsertRowid;
    const edit = (date) => registrationCrusadeEditSchema.parse({
      event_type: "street", event_name: "Edited Name", event_date: date, venue: "Edited Venue",
      expected_attendance: 100, minister_name: "Pastor", city: "Lagos",
      crusade_collaborators: ["REON", "Lagos Zone 1"], zone_contribution: ["Sending Partners"],
      estimated_budget: "5000", permits_obtained: "Yes", status: "pending",
    });

    // A future crusade accepts the new planning details.
    const future = updateRegistrationCrusade(makeItem("2099-01-01"), edit("2099-01-01"));
    assert.equal(future.crusade_collaborators, "REON, Lagos Zone 1");
    assert.equal(future.zone_contribution, "Sending Partners");
    assert.equal(future.estimated_budget, "5000");
    assert.equal(future.permits_obtained, "Yes");

    // A past crusade keeps its original planning details, but still edits everything else.
    const past = updateRegistrationCrusade(makeItem("2020-01-01"), edit("2020-01-01"));
    assert.equal(past.crusade_collaborators, "REON");
    assert.equal(past.zone_contribution, "Sending Pastors");
    assert.equal(past.estimated_budget, "1000");
    assert.equal(past.permits_obtained, "No");
    assert.equal(past.event_name, "Edited Name");
  } finally {
    db.exec("ROLLBACK");
  }
});

test("private dashboard report validates one complete registered crusade outcome", () => {
  const crusade = {
    format: "physical", event_type: "street", event_name: "Lagos Street Crusade", country: "Nigeria", city: "Lagos",
    city_place_id: "place-1", event_date: "2026-07-20", attendance: 450, minister_name: "Pastor Test",
    venue: "Test Square", salvation: 25,
  };
  assert.equal(portalCrusadeReportSchema.safeParse({ crusade }).success, true);
  assert.equal(portalCrusadeReportSchema.safeParse({ crusade: { ...crusade, minister_name: "" } }).success, false);
});

test("cell reports retain the full zone hierarchy", () => {
  const report = {
    organization_type: "cell", zone: "Lagos Zone 1", group_name: "Lekki Group",
    church_name: "Christ Embassy Lekki", cell_name: "Victory Cell",
    contact_name: "Test Coordinator", contact_email: "test@example.com",
    phone_country_code: "+234", phone_number: "801 234 5678",
    crusades: [{ format: "physical", event_type: "street", event_name: "Victory Reach", country: "Nigeria", city: "Lagos",
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

test("super-admin deletions preserve linked data until the report is removed", () => {
  const marker = `Delete flow ${Date.now()}`;
  db.exec("BEGIN");
  try {
    const registrationId = db.prepare(
      `INSERT INTO registrations (organization_type, zone, country, plan_date, kingschat_username)
       VALUES ('zone', ?, 'Nigeria', '2026-08-01', 'owner.user')`
    ).run(marker).lastInsertRowid;
    const itemId = db.prepare(
      `INSERT INTO registration_items
       (registration_id, organization_type, zone, country, plan_date, event_type, planned_count, event_name, event_date, venue, expected_attendance, city)
       VALUES (?, 'zone', ?, 'Nigeria', '2026-08-01', 'mega', 1, ?, '2026-08-01', 'Test venue', 1000, 'Lagos')`
    ).run(registrationId, marker, marker).lastInsertRowid;
    const reportId = db.prepare(
      `INSERT INTO reports (organization_type, zone, country, kingschat_username) VALUES ('zone', ?, 'Nigeria', 'owner.user')`
    ).run(marker).lastInsertRowid;
    const crusadeId = db.prepare(
      `INSERT INTO crusades (report_id, organization_type, zone, country, event_type, city, event_date, registration_item_id)
       VALUES (?, 'zone', ?, 'Nigeria', 'mega', 'Lagos', '2026-08-01', ?)`
    ).run(reportId, marker, itemId).lastInsertRowid;

    assert.throws(() => deleteRegistrationCrusade(itemId), (error) => error.code === "REPORT_EXISTS");
    assert.equal(deleteCrusadeReport(crusadeId).report_deleted, true);
    assert.equal(db.prepare("SELECT 1 FROM reports WHERE id = ?").get(reportId), undefined);
    assert.equal(deleteRegistrationCrusade(itemId).registration_deleted, true);
    assert.equal(db.prepare("SELECT 1 FROM registrations WHERE id = ?").get(registrationId), undefined);
  } finally {
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
