import test from "node:test";
import assert from "node:assert/strict";
import { zoneExpenseReportSchema } from "./validation.js";

const valid = {
  zone_name: "BENIN ZONE 1", designation: "Zonal Pastor", first_name: "Ngozi", last_name: "Eze", email: "ngozi@example.com",
  phone_country_code: "+234", phone_number: "8098765432", kingschat_username: "@NgoziEze",
  crusade_count: "8", period_from: "2026-08-01", period_to: "2026-08-31",
  items: [{ category: "Venue", amount_espees: "2500" }, { category: "Other", amount_espees: 150.25, note: "Chairs hire" }],
};

test("accepts a complete zonal expense report and coerces numbers", () => {
  const parsed = zoneExpenseReportSchema.parse(valid);
  assert.equal(parsed.crusade_count, 8);
  assert.equal(parsed.items[0].amount_espees, 2500);
});

test("rejects Other without a note, sub-cent amounts, and inverted periods", () => {
  assert.throws(() => zoneExpenseReportSchema.parse({ ...valid, items: [{ category: "Other", amount_espees: 5 }] }), /Describe the expense/);
  assert.throws(() => zoneExpenseReportSchema.parse({ ...valid, items: [{ category: "Venue", amount_espees: 1.005 }] }), /two decimal/);
  assert.throws(() => zoneExpenseReportSchema.parse({ ...valid, period_to: "2026-07-01" }), /on or after/);
  assert.throws(() => zoneExpenseReportSchema.parse({ ...valid, items: [] }), /at least one/);
});

test("only regional pastors, zonal directors and zonal pastors can submit", () => {
  assert.throws(() => zoneExpenseReportSchema.parse({ ...valid, designation: "Group Pastor" }), /Select your designation/);
  assert.equal(zoneExpenseReportSchema.parse({ ...valid, designation: "Regional Pastor" }).designation, "Regional Pastor");
});
