import test from "node:test";
import assert from "node:assert/strict";
import { db } from "./db.js";
import { getCampaignSettings, updateCampaignSettings } from "./routes/campaignSettings.js";

test("campaign settings persist network dashboard inheritance independently per network", () => {
  db.exec("BEGIN");
  try {
    let settings = updateCampaignSettings({
      network_dashboard_inherited_crusades: { "Youths Aglow": true, TEEVOLUTION: false },
    });
    assert.equal(settings.network_dashboard_inherited_crusades["Youths Aglow"], true);
    assert.equal(settings.network_dashboard_inherited_crusades.TEEVOLUTION, false);
    assert.equal(settings.network_dashboard_inherited_crusades["Say Yes to Kids"], false);

    settings = updateCampaignSettings({ network_dashboard_inherited_crusades: { TEEVOLUTION: true } });
    assert.equal(settings.network_dashboard_inherited_crusades["Youths Aglow"], true);
    assert.equal(settings.network_dashboard_inherited_crusades.TEEVOLUTION, true);
    assert.deepEqual(getCampaignSettings().network_dashboard_inherited_crusades, settings.network_dashboard_inherited_crusades);
  } finally {
    db.exec("ROLLBACK");
  }
});
