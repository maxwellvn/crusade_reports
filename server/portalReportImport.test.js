import test from "node:test";
import assert from "node:assert/strict";
import { portalReportPreview, shouldDirectCommitReport } from "./portalReportImport.js";

const entry = (id) => ({
  row_number: id + 1,
  item: { id, event_name: `Report ${id}` },
  body: {
    crusade: { event_date: "2026-08-30", attendance: id, online_participation: 0 },
    photo_links: "",
    video_links: "",
  },
});

test("personal-dashboard report imports preview up to 100 rows", () => {
  const validated = Array.from({ length: 100 }, (_, index) => entry(index + 1));
  const result = portalReportPreview(validated, { reports: 100, attendance: 5050, salvations: 0 });

  assert.equal(result.commit_required, false);
  assert.equal(result.rows.length, 100);
});

test("personal-dashboard report imports over 100 rows omit preview rows and require direct commit", () => {
  const validated = Array.from({ length: 101 }, (_, index) => entry(index + 1));
  const result = portalReportPreview(validated, { reports: 101, attendance: 5151, salvations: 0 });

  assert.equal(result.commit_required, true);
  assert.deepEqual(result.rows, []);
  assert.equal(result.summary.reports, 101);
});

test("personal-dashboard report imports over 100 rows commit on the first upload", () => {
  assert.equal(shouldDirectCommitReport(100), false);
  assert.equal(shouldDirectCommitReport(101), true);
  assert.equal(shouldDirectCommitReport(1, true), true);
});
