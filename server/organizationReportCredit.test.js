import test from "node:test";
import assert from "node:assert/strict";
import { db } from "./db.js";
import {
  isOrganizationReportCreditEnabled,
  setOrganizationReportCreditEnabled,
} from "./appSettings.js";
import { updateCampaignSettings } from "./routes/campaignSettings.js";
import { insertReport } from "./routes/reports.js";
import { METRIC_FIELDS } from "./db.js";
import { registrationProgress, registrationSummary } from "./routes/stats.js";

function addReport({ zone, registrationItemId = null }) {
  const reportId = db.prepare(`
    INSERT INTO reports (organization_type, zone, country, contact_name)
    VALUES ('zone', ?, 'Nigeria', 'Progress Test Reporter')
  `).run(zone).lastInsertRowid;
  db.prepare(`
    INSERT INTO crusades
      (report_id, organization_type, zone, country, event_type, event_name, city, event_date, registration_item_id)
    VALUES (?, 'zone', ?, 'Nigeria', 'street', 'Progress Test', 'Lagos', '2026-09-08', ?)
  `).run(reportId, zone, registrationItemId);
}

test("organization report credit is off by default and exposed through campaign settings", () => {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM app_settings WHERE key = 'organization_report_credit_enabled'").run();
    assert.equal(isOrganizationReportCreditEnabled(), false);
    const enabled = updateCampaignSettings({ organization_report_credit_enabled: true });
    assert.equal(enabled.organization_report_credit_enabled, true);
    assert.equal(isOrganizationReportCreditEnabled(), true);
  } finally {
    db.exec("ROLLBACK");
  }
});

test("enabled organization credit counts unlinked reports against plan without exceeding plan", () => {
  db.exec("BEGIN");
  try {
    setOrganizationReportCreditEnabled(true);
    const baselineZoneTypeHeld = registrationProgress("organization_type").find((row) => row.key === "zone")?.held || 0;
    const baselineStreetHeld = registrationProgress("event_type").find((row) => row.key === "street")?.held || 0;
    const zone = `Progress Zone ${Date.now()}`;
    const registrationId = db.prepare(`
      INSERT INTO registrations (organization_type, zone, country, plan_date)
      VALUES ('zone', ?, 'Nigeria', '2026-09-08')
    `).run(zone).lastInsertRowid;
    const itemId = db.prepare(`
      INSERT INTO registration_items
        (registration_id, organization_type, zone, country, plan_date, event_type, planned_count)
      VALUES (?, 'zone', ?, 'Nigeria', '2026-09-08', 'street', 2)
    `).run(registrationId, zone).lastInsertRowid;
    const otherZone = `${zone} Other`;
    const otherRegistrationId = db.prepare(`
      INSERT INTO registrations (organization_type, zone, country, plan_date)
      VALUES ('zone', ?, 'Nigeria', '2026-09-08')
    `).run(otherZone).lastInsertRowid;
    db.prepare(`
      INSERT INTO registration_items
        (registration_id, organization_type, zone, country, plan_date, event_type, planned_count)
      VALUES (?, 'zone', ?, 'Nigeria', '2026-09-08', 'street', 2)
    `).run(otherRegistrationId, otherZone);

    addReport({ zone, registrationItemId: itemId });
    addReport({ zone });
    addReport({ zone });
    addReport({ zone: otherZone });

    setOrganizationReportCreditEnabled(false);
    assert.equal(registrationProgress("zone").find((row) => row.key === zone).held, 1);

    setOrganizationReportCreditEnabled(true);
    const progress = registrationProgress("zone").find((row) => row.key === zone);
    assert.deepEqual({ planned: progress.planned, held: progress.held }, { planned: 2, held: 2 });
    assert.equal(registrationProgress("organization_type").find((row) => row.key === "zone").held, baselineZoneTypeHeld + 3);
    assert.equal(registrationProgress("event_type").find((row) => row.key === "street").held, baselineStreetHeld + 3);

    const summary = registrationSummary();
    assert.equal(summary.reported <= summary.total, true);
    assert.equal(summary.awaiting, summary.total - summary.reported);
  } finally {
    db.exec("ROLLBACK");
  }
});

test("organization credit still saves reports linked to registered crusades", () => {
  db.exec("BEGIN");
  try {
    setOrganizationReportCreditEnabled(true);
    const zone = `Linked Save ${Date.now()}`;
    const registrationId = db.prepare(`
      INSERT INTO registrations (organization_type, zone, country, plan_date)
      VALUES ('zone', ?, 'Nigeria', '2026-09-08')
    `).run(zone).lastInsertRowid;
    const itemId = db.prepare(`
      INSERT INTO registration_items
        (registration_id, organization_type, zone, country, plan_date, event_type, planned_count)
      VALUES (?, 'zone', ?, 'Nigeria', '2026-09-08', 'street', 1)
    `).run(registrationId, zone).lastInsertRowid;

    insertReport({
      organization_type: "zone",
      zone,
      country: "Nigeria",
      contact_name: "Linked Reporter",
      contact_email: "linked@example.com",
      phone_country_code: "+234",
      phone_number: "8012345678",
      kingschat_username: "linkedreporter",
      crusades: [{
        format: "physical",
        event_type: "street",
        event_name: `${zone} Registered`,
        country: "Nigeria",
        city: "Lagos",
        event_date: "2026-09-08",
        attendance: 10,
        crusade_expense: 0,
        minister_name: "Test Minister",
        venue: "Test Venue",
        registration_item_id: itemId,
        ...Object.fromEntries(METRIC_FIELDS.map((field) => [field, 0])),
      }],
    });

    const saved = db.prepare("SELECT id FROM crusades WHERE registration_item_id = ?").get(itemId);
    assert.equal(Boolean(saved?.id), true);
  } finally {
    db.exec("ROLLBACK");
  }
});
