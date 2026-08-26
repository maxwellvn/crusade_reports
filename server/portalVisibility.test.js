import test from "node:test";
import assert from "node:assert/strict";
import { personalDashboardScope } from "./portalVisibility.js";

test("network personal dashboards show only rows explicitly registered by that network", () => {
  for (const name of ["Youths Aglow", "TEEVOLUTION", "Say Yes to Kids"]) {
    const scope = personalDashboardScope({ name, kind: "network" });
    assert.equal(scope.col, "network_name");
    assert.equal(scope.listWhere("i."), "i.network_name = ?");
    assert.deepEqual(scope.listParams, [name]);
    assert.equal(scope.totalsWhere, "network_name = ?");
    assert.equal(scope.registrationsWhere, "r.network_name = ?");
  }
});

test("zone personal dashboards retain strict zone ownership", () => {
  const scope = personalDashboardScope({ name: "Lagos Zone 1", kind: "zone" });
  assert.equal(scope.col, "zone");
  assert.equal(scope.listWhere("registration_items."), "registration_items.zone = ?");
  assert.deepEqual(scope.listParams, ["Lagos Zone 1"]);
});
