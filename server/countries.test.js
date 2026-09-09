import test from "node:test";
import assert from "node:assert/strict";

import { COUNTRIES, normalizeCountryInput, resolveCountryName } from "./routes/countries.js";
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

test("bulk-upload countries tolerate copied labels, flags, and common long names", () => {
  assert.equal(normalizeCountryInput("COUNTRY: BAHRAIN \u{1F1E7}\u{1F1ED}"), "BAHRAIN");
  const cases = {
    "COUNTRY: BAHRAIN \u{1F1E7}\u{1F1ED}": "Bahrain",
    "COUNTRY: PALESTINE \u{1F1F5}\u{1F1F8}": "Palestinian Territories",
    "COUNTRY: SOLOMON ISLAND \u{1F1F8}\u{1F1E7}": "Solomon Islands",
    "COUNTRY: SAINT LUCIA \u{1F1F1}\u{1F1E8}": "St. Lucia",
    "COUNTRY: SAINT KITTS AND NEVIS \u{1F1F0}\u{1F1F3}": "St. Kitts & Nevis",
    "COUNTRY: SAINT VINCENT AND GRENADINES \u{1F1FB}\u{1F1E8}": "St. Vincent & Grenadines",
    "COUNTRY: COOK ISLANDS \u{1F1E8}\u{1F1F0}": "Cook Islands",
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(resolveCountryName(input), expected);
});
