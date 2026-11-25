import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

process.env.CRUSADE_DB_PATH = join(tmpdir(), `aac-campaign-isolation-${randomUUID()}.sqlite`);

const { db } = await import("./db.js");
const { campaignForHost, campaignEventDateError } = await import("./campaigns.js");
const { applyPortalScope } = await import("./portalScope.js");
const { findCrusadesForLookup, insertRegistration } = await import("./routes/registrations.js");
const { buildReportDashboardData } = await import("./routes/stats.js");
const { renderPageMetadata } = await import("./pageMeta.js");

const registration = (campaign, eventName, eventDate) => ({
  campaign,
  organization_type: "zone",
  zone: "Test Zone",
  group_name: "",
  zone_manual: false,
  group_manual: false,
  church_name: "",
  cell_name: "",
  network_name: "",
  contact_name: "Campaign Tester",
  contact_email: "shared@example.test",
  phone_country_code: "+234",
  phone_number: "8000000000",
  kingschat_username: "campaign.tester",
  items: [{
    event_type: "mega",
    other_event_type: "",
    event_name: eventName,
    event_date: eventDate,
    venue: "Test Venue",
    expected_attendance: 100,
    minister_name: "Test Minister",
    country: "Nigeria",
    city: "Lagos",
    city_place_id: "",
    crusade_collaborators: [],
    zone_contribution: [],
    estimated_budget: "",
    rhapsody_copies_confirmed: "",
    permits_obtained: "",
    media_coverage_plan: "",
  }],
});

test("campaign host resolution is explicit and defaults safely to NOTC", () => {
  assert.equal(campaignForHost("aac.rhapsodycrusades.org"), "aac");
  assert.equal(campaignForHost("aac.localhost:5173"), "aac");
  assert.equal(campaignForHost("notc.rhapsodycrusades.org"), "notc");
  assert.equal(campaignForHost("localhost:5173"), "notc");
});

test("existing rows default to NOTC and AAC dates are restricted to December 2026", () => {
  const reportId = db.prepare("INSERT INTO reports (organization_type, country) VALUES ('zone', 'Nigeria')").run().lastInsertRowid;
  assert.equal(db.prepare("SELECT campaign FROM reports WHERE id = ?").get(reportId).campaign, "notc");
  assert.equal(campaignEventDateError("aac", "2026-12-01"), "");
  assert.match(campaignEventDateError("aac", "2026-11-30"), /2026-12-01/);
  assert.equal(campaignEventDateError("notc", "2026-08-28"), "");
});

test("registration lookup and date enforcement cannot cross campaign boundaries", () => {
  insertRegistration(registration("notc", "NOTC lookup record", "2026-08-28"));
  insertRegistration(registration("aac", "Angels lookup record", "2026-12-12"));

  assert.deepEqual(findCrusadesForLookup("notc", "shared@example.test").map((row) => row.event_name), ["NOTC lookup record"]);
  assert.deepEqual(findCrusadesForLookup("aac", "shared@example.test").map((row) => row.event_name), ["Angels lookup record"]);
  assert.throws(
    () => insertRegistration(registration("aac", "Out-of-range Angels record", "2027-01-01")),
    (error) => error?.code === "CAMPAIGN_DATE",
  );
});

test("the same portal token resolves only inside its campaign token store", () => {
  const token = `shared-token-${randomUUID()}`;
  db.prepare("INSERT INTO zone_tokens (zone, token, kind) VALUES (?, ?, 'zone')").run("NOTC Zone", token);
  db.prepare("INSERT INTO campaign_zone_tokens (campaign, zone, token, kind) VALUES ('aac', ?, ?, 'zone')").run("Angels Zone", token);

  assert.equal(applyPortalScope({}, token, "notc").zone, "NOTC Zone");
  assert.equal(applyPortalScope({}, token, "aac").zone, "Angels Zone");
});

test("report dashboards aggregate only the selected campaign", () => {
  const addReport = (campaign, eventName, eventDate, attendance) => {
    const reportId = db.prepare("INSERT INTO reports (campaign, organization_type, country) VALUES (?, 'zone', 'Nigeria')").run(campaign).lastInsertRowid;
    db.prepare(`INSERT INTO crusades
      (campaign, report_id, organization_type, country, format, event_type, event_name, city, event_date, attendance)
      VALUES (?, ?, 'zone', 'Nigeria', 'physical', 'mega', ?, 'Lagos', ?, ?)`)
      .run(campaign, reportId, eventName, eventDate, attendance);
  };
  addReport("notc", "NOTC dashboard record", "2026-08-28", 111);
  addReport("aac", "Angels dashboard record", "2026-12-20", 222);

  const notc = buildReportDashboardData("notc");
  const aac = buildReportDashboardData("aac");
  assert.equal(notc.totals.attendance, 111);
  assert.equal(aac.totals.attendance, 222);
  assert.ok(notc.recent.every((row) => row.country === "Nigeria"));
  assert.equal(notc.recent.some((row) => row.crusades === 1), true);
  assert.equal(aac.recent.some((row) => row.crusades === 1), true);
});

test("server-rendered metadata follows the request campaign", () => {
  const template = "<html><head><title>Portal</title></head><body></body></html>";
  const notc = renderPageMetadata(template, "/", "https://notc.rhapsodycrusades.org", "notc");
  const aac = renderPageMetadata(template, "/", "https://aac.rhapsodycrusades.org", "aac");
  assert.match(notc, /A Night of a Thousand Crusades/);
  assert.doesNotMatch(notc, /Angels at Christmas/);
  assert.match(aac, /Angels at Christmas/);
  assert.match(aac, /angels-at-christmas-emblem\.png/);
});
