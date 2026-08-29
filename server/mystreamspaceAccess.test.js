import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

import {
  createMyStreamSpaceUpdateToken,
  getMyStreamSpaceUpdateTokenStatus,
  isValidMyStreamSpaceUpdateToken,
  revokeMyStreamSpaceUpdateToken,
} from "./mystreamspaceAccess.js";
import {
  formatWholeNumberInput,
  parseWholeNumberInput,
} from "../client/src/lib/wholeNumberInput.js";

function settingsDatabase() {
  const database = new Database(":memory:");
  database.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  return database;
}

test("MyStreamSpace update links persist only a hash and can be revoked", () => {
  const database = settingsDatabase();
  const generated = createMyStreamSpaceUpdateToken(database);

  assert.match(generated.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(isValidMyStreamSpaceUpdateToken(generated.token, database), true);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM app_settings WHERE value = ?").get(generated.token).count,
    0,
    "the raw capability token must never be stored",
  );
  assert.deepEqual(getMyStreamSpaceUpdateTokenStatus(database), {
    active: true,
    created_at: generated.created_at,
  });

  revokeMyStreamSpaceUpdateToken(database);
  assert.equal(isValidMyStreamSpaceUpdateToken(generated.token, database), false);
  assert.deepEqual(getMyStreamSpaceUpdateTokenStatus(database), { active: false, created_at: null });
  database.close();
});

test("regenerating the MyStreamSpace update link invalidates the previous link", () => {
  const database = settingsDatabase();
  const first = createMyStreamSpaceUpdateToken(database);
  const second = createMyStreamSpaceUpdateToken(database);

  assert.notEqual(first.token, second.token);
  assert.equal(isValidMyStreamSpaceUpdateToken(first.token, database), false);
  assert.equal(isValidMyStreamSpaceUpdateToken(second.token, database), true);
  database.close();
});

test("whole-number fields add separators while preserving a valid integer value", () => {
  assert.equal(formatWholeNumberInput("416557"), "416,557");
  assert.equal(formatWholeNumberInput("308,240,424"), "308,240,424");
  assert.equal(formatWholeNumberInput("001000"), "1,000");
  assert.equal(parseWholeNumberInput("308,240,424"), 308_240_424);
  assert.equal(parseWholeNumberInput(""), null);
  assert.equal(parseWholeNumberInput("12 people"), null);
});
