import test from "node:test";
import assert from "node:assert/strict";
import { db } from "./db.js";
import { getCampaignSettings, updateCampaignSettings } from "./routes/campaignSettings.js";

test("campaign settings persist the network dashboard inheritance toggle", () => {
  db.exec("BEGIN");
  try {
    let settings = updateCampaignSettings({ network_dashboard_inherited_crusades_enabled: true });
    assert.equal(settings.network_dashboard_inherited_crusades_enabled, true);
    assert.equal(getCampaignSettings().network_dashboard_inherited_crusades_enabled, true);

    settings = updateCampaignSettings({ network_dashboard_inherited_crusades_enabled: false });
    assert.equal(settings.network_dashboard_inherited_crusades_enabled, false);
  } finally {
    db.exec("ROLLBACK");
  }
});
