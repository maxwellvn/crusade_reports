import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_REPORT_ORDER, portalItemOrder, PORTAL_UNREGISTERED_REPORT_ORDER } from "./reportOrdering.js";

test("admin reports default to newest submission first", () => {
  assert.equal(ADMIN_REPORT_ORDER, "c.created_at DESC, c.id DESC");
});

test("portal report rows put submitted reports first from newest to oldest", () => {
  assert.match(portalItemOrder("reports"), /report_id IS NULL THEN 1 ELSE 0 END/);
  assert.match(portalItemOrder("reports"), /created_at DESC/);
  assert.equal(PORTAL_UNREGISTERED_REPORT_ORDER, "created_at DESC, id DESC");
});

test("portal registration rows retain their registration ordering", () => {
  assert.match(portalItemOrder("registrations"), /event_date.*plan_date/);
  assert.doesNotMatch(portalItemOrder("registrations"), /report_id IS NULL/);
});
