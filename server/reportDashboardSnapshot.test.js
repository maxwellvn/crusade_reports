import test from "node:test";
import assert from "node:assert/strict";
import { db } from "./db.js";
import {
  readReportDashboardSnapshot,
  reportDashboardData,
  saveReportDashboardSnapshot,
} from "./reportDashboardSnapshot.js";

test("reports dashboard serves its persisted snapshot without rebuilding", async () => {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM registration_dashboard_snapshots WHERE key = 'reports-dashboard-v1'").run();
    let builds = 1;
    saveReportDashboardSnapshot({ marker: builds });
    const second = await reportDashboardData(() => ({ marker: ++builds }));
    assert.deepEqual(second, { marker: 1 });
    assert.equal(builds, 1);
    assert.deepEqual(readReportDashboardSnapshot().data, { marker: 1 });

    saveReportDashboardSnapshot({ marker: 2 });
    assert.deepEqual(readReportDashboardSnapshot().data, { marker: 2 });
  } finally {
    db.exec("ROLLBACK");
  }
});
