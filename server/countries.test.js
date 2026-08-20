import test from "node:test";
import assert from "node:assert/strict";

import { COUNTRIES, resolveCountryName } from "./routes/countries.js";
import { registrationSchema } from "./validation.js";

const validRegistration = (country) => ({
  organization_type: "network",
  network_name: "Test Network",
  contact_name: "Test User",
  contact_email: "test@example.com",
  phone_country_code: "+234",
  phone_number: "8012345678",
  items: [{
    event_type: "mega",
    event_name: "Test Crusade",
    event_date: "2026-08-20",
    venue: "Test Venue",
    expected_attendance: 100,
    minister_name: "Test Minister",
    country,
    city: "Lagos",
  }],
});

test("country directory contains the configured 242 canonical nations", () => {
  assert.equal(COUNTRIES.length, 242);
});

test("country aliases normalize to the canonical stored name", () => {
  assert.equal(resolveCountryName("  united states of america  "), "United States");
  const parsed = registrationSchema.parse(validRegistration("USA"));
  assert.equal(parsed.items[0].country, "United States");
});

test("unknown bulk-upload country values are rejected", () => {
  const parsed = registrationSchema.safeParse(validRegistration("Nigria"));
  assert.equal(parsed.success, false);
  assert.match(parsed.error.issues[0].message, /not recognized/);
});
