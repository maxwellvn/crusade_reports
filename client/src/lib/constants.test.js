import test from "node:test";
import assert from "node:assert/strict";
import { emptyCrusade, METRIC_KEYS } from "./constants.js";

// Regression: Object.fromEntries(METRIC_KEYS.map((k) => 0)) threw
// "Iterator value 0 is not an entry object" and blanked the whole report form.
test("emptyCrusade builds a complete crusade object with zeroed metrics", () => {
  const c = emptyCrusade();
  assert.equal(typeof c, "object");
  for (const key of ["format", "event_type", "event_name", "country", "city", "event_date", "minister_name", "venue", "photo_links", "video_links"]) {
    assert.equal(c[key], "", `${key} should default to an empty string`);
  }
  assert.equal(c.attendance, 0);
  assert.equal(c.crusade_expense, 0);
  for (const metric of METRIC_KEYS) {
    assert.equal(c[metric], 0, `metric ${metric} should default to 0`);
  }
});
