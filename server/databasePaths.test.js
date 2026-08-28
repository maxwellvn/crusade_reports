import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveRegistrationDatabasePath } from "./databasePaths.js";

function fixture({ embeddedRegistrations = false, registrationFile = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "crusade-db-paths-"));
  const reportsPath = join(directory, "reports.sqlite");
  const registrationsPath = join(directory, "registrations.sqlite");
  const reports = new Database(reportsPath);
  reports.exec("CREATE TABLE reports (id INTEGER PRIMARY KEY)");
  if (embeddedRegistrations) reports.exec("CREATE TABLE registration_items (id INTEGER PRIMARY KEY)");
  reports.close();
  if (registrationFile) {
    const registrations = new Database(registrationsPath);
    registrations.exec("CREATE TABLE registration_items (id INTEGER PRIMARY KEY)");
    registrations.close();
  }
  return { directory, reportsPath, registrationsPath };
}

test("uses an explicitly configured registration database", () => {
  const paths = fixture({ registrationFile: false });
  try {
    assert.equal(resolveRegistrationDatabasePath(paths.reportsPath, "/configured/registrations.sqlite"), "/configured/registrations.sqlite");
  } finally {
    rmSync(paths.directory, { recursive: true, force: true });
  }
});

test("does not activate split mode while the reports database still embeds registration tables", () => {
  const paths = fixture({ embeddedRegistrations: true });
  try {
    assert.equal(resolveRegistrationDatabasePath(paths.reportsPath), null);
  } finally {
    rmSync(paths.directory, { recursive: true, force: true });
  }
});

test("automatically activates a verified sibling registration database for a report-only database", () => {
  const paths = fixture();
  try {
    assert.equal(resolveRegistrationDatabasePath(paths.reportsPath), paths.registrationsPath);
  } finally {
    rmSync(paths.directory, { recursive: true, force: true });
  }
});
