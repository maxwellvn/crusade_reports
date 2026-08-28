import test from "node:test";
import assert from "node:assert/strict";
import { cachedDashboardData, clearDashboardCache } from "./dashboardCache.js";

test("dashboard caches can be invalidated immediately after registrations change", () => {
  let value = 0;
  const compute = () => { value += 1; return value; };

  assert.equal(cachedDashboardData("registration-total", compute), 1);
  assert.equal(cachedDashboardData("registration-total", compute), 1);
  clearDashboardCache();
  assert.equal(cachedDashboardData("registration-total", compute), 2);
});
