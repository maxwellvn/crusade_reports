import test from "node:test";
import assert from "node:assert/strict";

import {
  applyMyStreamSpaceAdjustment,
  combineMyStreamSpaceTotals,
  normalizeMyStreamSpaceAdjustment,
} from "./mystreamspaceStats.js";

test("manual MyStreamSpace values add to overall, type, and online-format analytics once", () => {
  const raw = {
    reports: 7,
    totals: { crusades: 10, attendance: 20, online_participation: 50 },
    by_category: [
      { key: "mystreamspace", crusades: 4, attendance: 0, online_attendance: 110, salvation: 2 },
      { key: "online", crusades: 6, attendance: 20, online_attendance: 40, salvation: 3 },
    ],
    by_format: [
      { key: "online", crusades: 6, attendance: 0, online_attendance: 150, salvation: 2 },
      { key: "physical", crusades: 4, attendance: 20, online_attendance: 0, salvation: 3 },
    ],
  };

  const adjusted = applyMyStreamSpaceAdjustment(raw, {
    crusades: 416_557,
    online_attendance: 308_240_424,
  });

  assert.deepEqual(adjusted.totals, {
    crusades: 416_567,
    attendance: 20,
    online_participation: 308_240_474,
  });
  assert.equal(adjusted.reports, 416_564);
  assert.deepEqual(adjusted.by_category.find((row) => row.key === "mystreamspace"), {
    key: "mystreamspace",
    crusades: 416_561,
    attendance: 0,
    online_attendance: 308_240_534,
    salvation: 2,
  });
  assert.deepEqual(adjusted.by_format.find((row) => row.key === "online"), {
    key: "online",
    crusades: 416_563,
    attendance: 0,
    online_attendance: 308_240_574,
    salvation: 2,
  });
  assert.deepEqual(adjusted.mystreamspace, {
    crusades: 416_561,
    online_attendance: 308_240_534,
  });
  assert.equal(adjusted.by_category[0].key, "mystreamspace");
  assert.equal(adjusted.by_format[0].key, "online");
  assert.equal(raw.reports, 7, "the raw report submission count remains unchanged");
  assert.equal(raw.totals.crusades, 10, "the raw database analytics remain unchanged");
});

test("manual MyStreamSpace values create missing dashboard aggregates without fabricating database rows", () => {
  const adjusted = applyMyStreamSpaceAdjustment({
    reports: 0,
    totals: { crusades: 0, online_participation: 0 },
    by_category: [],
    by_format: [],
  }, { crusades: 12, online_attendance: 34 });

  assert.deepEqual(adjusted.by_category, [{
    key: "mystreamspace", crusades: 12, attendance: 0, online_attendance: 34, salvation: 0,
  }]);
  assert.deepEqual(adjusted.by_format, [{
    key: "online", crusades: 12, attendance: 0, online_attendance: 34, salvation: 0,
  }]);
  assert.equal(adjusted.reports, 12);
});

test("public MyStreamSpace totals expose existing, manual, and combined values", () => {
  assert.deepEqual(
    combineMyStreamSpaceTotals(
      { crusades: 4, online_attendance: 110 },
      { crusades: 416_557, online_attendance: 308_240_424 },
    ),
    {
      existing: { crusades: 4, online_attendance: 110 },
      manual: { crusades: 416_557, online_attendance: 308_240_424 },
      totals: { crusades: 416_561, online_attendance: 308_240_534 },
    },
  );
});

test("MyStreamSpace settings accept only non-negative safe whole numbers", () => {
  assert.deepEqual(normalizeMyStreamSpaceAdjustment({ crusades: "12", online_attendance: "34" }), {
    crusades: 12,
    online_attendance: 34,
  });
  for (const invalid of [
    { crusades: -1, online_attendance: 1 },
    { crusades: 1.5, online_attendance: 1 },
    { crusades: 1, online_attendance: Number.MAX_SAFE_INTEGER + 1 },
    { crusades: "", online_attendance: 1 },
  ]) {
    assert.throws(() => normalizeMyStreamSpaceAdjustment(invalid), /non-negative whole numbers/i);
  }
});
