import test from "node:test";
import assert from "node:assert/strict";
import { typeLabel } from "./labels.js";

test("event labels distinguish crusades from outreaches", () => {
  assert.equal(typeLabel("mega"), "Mega Crusades (4,000+ people)");
  assert.equal(typeLabel("online"), "Online Crusades");
  assert.equal(typeLabel("mystreamspace"), "MyStreamSpace Crusades");
  assert.equal(typeLabel("radio"), "Radio Crusades");
  assert.equal(typeLabel("tv"), "TV Crusades");
  assert.equal(typeLabel("rabah"), "Rabah Cellular Outreach");
  assert.equal(typeLabel("street"), "Street Outreach");
  assert.equal(typeLabel("other", "Market Crusade"), "Market Outreach");
});
