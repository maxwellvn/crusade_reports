import test from "node:test";
import assert from "node:assert/strict";
import { shouldThrottleBackup } from "./databaseProtection.js";

test("frequent registration backups are coalesced without throttling scheduled protection", () => {
  const now = Date.parse("2026-08-24T15:00:00.000Z");
  const recent = "2026-08-24T14:58:00.000Z";
  const old = "2026-08-24T14:50:00.000Z";
  const intervalMs = 5 * 60 * 1000;

  assert.equal(shouldThrottleBackup({ reason: "registration", lastSuccessAt: recent, now, intervalMs }), true);
  assert.equal(shouldThrottleBackup({ reason: "registration", lastSuccessAt: old, now, intervalMs }), false);
  assert.equal(shouldThrottleBackup({ reason: "scheduled", lastSuccessAt: recent, now, intervalMs }), false);
  assert.equal(shouldThrottleBackup({ reason: "registration", lastSuccessAt: null, now, intervalMs }), false);
});
