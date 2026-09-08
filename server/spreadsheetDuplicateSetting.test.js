import test from "node:test";
import assert from "node:assert/strict";
import { db } from "./db.js";
import {
  isSpreadsheetDuplicateProtectionEnabled,
  setSpreadsheetDuplicateProtectionEnabled,
  shouldProtectAgainstDuplicateReports,
} from "./appSettings.js";
import { updateCampaignSettings } from "./routes/campaignSettings.js";
import { insertReport } from "./routes/reports.js";
import { METRIC_FIELDS } from "./db.js";

function reportPayload(marker, spreadsheetImported) {
  return {
    organization_type: "zone",
    zone: "Test Zone",
    country: "Nigeria",
    contact_name: "Test Reporter",
    contact_email: "reporter@example.com",
    phone_country_code: "+234",
    phone_number: "8012345678",
    kingschat_username: "testreporter",
    crusades: [{
      format: "physical",
      event_type: "street",
      event_name: marker,
      country: "Nigeria",
      city: "Lagos",
      event_date: "2026-09-08",
      attendance: 10,
      crusade_expense: 0,
      minister_name: "Test Minister",
      venue: "Test Venue",
      spreadsheet_imported: spreadsheetImported,
      ...Object.fromEntries(METRIC_FIELDS.map((field) => [field, 0])),
    }],
  };
}

test("spreadsheet duplicate protection defaults on and can be changed from campaign settings", () => {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM app_settings WHERE key = 'spreadsheet_duplicate_protection_enabled'").run();
    assert.equal(isSpreadsheetDuplicateProtectionEnabled(), true);
    assert.equal(shouldProtectAgainstDuplicateReports("spreadsheet"), true);

    let updated = updateCampaignSettings({ spreadsheet_duplicate_protection_enabled: false });
    assert.equal(updated.spreadsheet_duplicate_protection_enabled, false);
    assert.equal(isSpreadsheetDuplicateProtectionEnabled(), false);
    assert.equal(shouldProtectAgainstDuplicateReports("spreadsheet"), false);
    assert.equal(shouldProtectAgainstDuplicateReports("manual"), true);

    updated = updateCampaignSettings({ spreadsheet_duplicate_protection_enabled: true });
    assert.equal(updated.spreadsheet_duplicate_protection_enabled, true);
    assert.equal(isSpreadsheetDuplicateProtectionEnabled(), true);
  } finally {
    db.exec("ROLLBACK");
  }
});

test("turning protection off accepts spreadsheet duplicates but still protects manual submissions", () => {
  db.exec("BEGIN");
  try {
    const marker = `Spreadsheet toggle ${Date.now()}`;
    insertReport(reportPayload(marker, false));

    setSpreadsheetDuplicateProtectionEnabled(true);
    const protectedUpload = reportPayload(marker, true);
    insertReport(protectedUpload);
    assert.equal(protectedUpload.skippedDuplicates, 1);

    setSpreadsheetDuplicateProtectionEnabled(false);
    const allowedUpload = reportPayload(marker, true);
    insertReport(allowedUpload);
    assert.equal(allowedUpload.skippedDuplicates, 0);

    const protectedManual = reportPayload(marker, false);
    insertReport(protectedManual);
    assert.equal(protectedManual.skippedDuplicates, 1);

    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM crusades WHERE event_name = ?").get(marker).count, 2);
  } finally {
    db.exec("ROLLBACK");
  }
});
