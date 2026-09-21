import test from "node:test";
import assert from "node:assert/strict";
import { MEGA_CRUSADE_MINIMUM, zoneExpenseReportSchema } from "./validation.js";

const pastor = { zone_name: "BENIN ZONE 1", designation: "Zonal Pastor", first_name: "Ngozi", last_name: "Eze", kingschat_username: "@NgoziEze" };
const crusade = { crusade_name: "City Mega Crusade", nation: "Benin", event_date: "2026-08-01", currency_code: "ngn", espees_equivalent: 400 };
const sponsored = { ...crusade, pastor_flight: 250, accompanying_count: 2, accompanying_flight: 300, sponsorship_given: 100, espees_already_given: 50 };
const own = { ...crusade, attendance: 1200, venue_cost: 500, transport_cost: 120 };

test("accepts a report with both parts and upper-cases the currency", () => {
  const parsed = zoneExpenseReportSchema.parse({ ...pastor, sponsored: [sponsored], own: [own] });
  assert.equal(parsed.sponsored[0].currency_code, "NGN");
  assert.equal(parsed.own[0].venue_cost, 500);
});

test("either part alone is enough, but not neither", () => {
  assert.equal(zoneExpenseReportSchema.parse({ ...pastor, own: [own] }).sponsored.length, 0);
  assert.equal(zoneExpenseReportSchema.parse({ ...pastor, sponsored: [sponsored] }).own.length, 0);
  assert.throws(() => zoneExpenseReportSchema.parse(pastor), /at least one crusade/);
});

test("Part B holds the mega threshold; Part A asks for no attendance at all", () => {
  assert.throws(() => zoneExpenseReportSchema.parse({ ...pastor, own: [{ ...own, attendance: MEGA_CRUSADE_MINIMUM - 1 }] }), /Only mega crusades/);
  assert.equal(zoneExpenseReportSchema.parse({ ...pastor, sponsored: [sponsored] }).sponsored[0].attendance, undefined);
});

test("a blank Part A row is dropped rather than blocking a Part B-only report", () => {
  const blank = { crusade_name: "", nation: "", city: "", event_date: "", currency_code: "", pastor_flight: "", espees_equivalent: "" };
  const parsed = zoneExpenseReportSchema.parse({ ...pastor, sponsored: [blank], own: [own] });
  assert.equal(parsed.sponsored.length, 0);
  assert.equal(parsed.own.length, 1);
  assert.throws(() => zoneExpenseReportSchema.parse({ ...pastor, sponsored: [blank] }), /at least one crusade/);
});

test("rejects unsupported designations, bad currencies and missing Espees equivalents", () => {
  assert.throws(() => zoneExpenseReportSchema.parse({ ...pastor, designation: "Group Pastor", own: [own] }), /Select your designation/);
  assert.throws(() => zoneExpenseReportSchema.parse({ ...pastor, own: [{ ...own, currency_code: "NAIRA" }] }), /Select the currency/);
  assert.throws(() => zoneExpenseReportSchema.parse({ ...pastor, own: [{ ...own, espees_equivalent: 0 }] }), /Espees equivalent/);
});

test("Part B needs a venue or transport cost; Part A other-costs need a description", () => {
  assert.throws(() => zoneExpenseReportSchema.parse({ ...pastor, own: [{ ...own, venue_cost: 0, transport_cost: 0 }] }), /venue or transportation/);
  assert.throws(() => zoneExpenseReportSchema.parse({ ...pastor, sponsored: [{ ...sponsored, other_cost_amount: 80 }] }), /Describe the other costs/);
});
