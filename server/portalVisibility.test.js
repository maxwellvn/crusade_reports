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
    assert.deepEqual(scope.totalsParams, [name]);
    assert.equal(scope.registrationsWhere, "r.network_name = ?");
    assert.deepEqual(scope.registrationsParams, [name]);
  }
});

test("zone personal dashboards retain strict zone ownership", () => {
  const scope = personalDashboardScope({ name: "Lagos Zone 1", kind: "zone" });
  assert.equal(scope.col, "zone");
  assert.equal(scope.listWhere("registration_items."), "registration_items.zone = ?");
  assert.deepEqual(scope.listParams, ["Lagos Zone 1"]);
});

test("enabled inheritance restores mapped event types and Youths Aglow BLW rows", () => {
  const youths = personalDashboardScope({ name: "Youths Aglow", kind: "network", includeInherited: true });
  assert.equal(youths.listWhere("i."), "(i.network_name = ? OR i.event_type = ? OR (i.zone IS NOT NULL AND (LOWER(i.zone) LIKE 'blw%')))");
  assert.deepEqual(youths.listParams, ["Youths Aglow", "youths-aglow"]);
  assert.equal(youths.totalsWhere, "(network_name = ? OR event_type = ? OR (zone IS NOT NULL AND (LOWER(zone) LIKE 'blw%')))");
  assert.deepEqual(youths.totalsParams, ["Youths Aglow", "youths-aglow"]);
  assert.equal(youths.registrationsWhere, "(r.network_name = ? OR (r.zone IS NOT NULL AND (LOWER(r.zone) LIKE 'blw%')) OR EXISTS (SELECT 1 FROM registration_items scoped_i WHERE scoped_i.registration_id = r.id AND scoped_i.event_type = ?))");
  assert.deepEqual(youths.registrationsParams, ["Youths Aglow", "youths-aglow"]);

  const teens = personalDashboardScope({ name: "TEEVOLUTION", kind: "network", includeInherited: true });
  assert.equal(teens.listWhere("i."), "(i.network_name = ? OR i.event_type = ?)");
  assert.deepEqual(teens.listParams, ["TEEVOLUTION", "teevolution"]);
  assert.equal(teens.totalsWhere, "(network_name = ? OR event_type = ?)");
  assert.deepEqual(teens.totalsParams, ["TEEVOLUTION", "teevolution"]);
  assert.equal(teens.registrationsWhere, "(r.network_name = ? OR EXISTS (SELECT 1 FROM registration_items scoped_i WHERE scoped_i.registration_id = r.id AND scoped_i.event_type = ?))");
  assert.deepEqual(teens.registrationsParams, ["TEEVOLUTION", "teevolution"]);
});
