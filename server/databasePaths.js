import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// Preserve explicit configuration. When Coolify has no split-database variable,
// activate the sibling registrations database only after the main database has
// been migrated to report-only form. This prevents accidentally pairing a stale
// registrations snapshot with a still-monolithic live database.
export function resolveRegistrationDatabasePath(reportsPath, configuredPath = process.env.REGISTRATION_DB_PATH || null) {
  if (configuredPath) return configuredPath;

  const candidatePath = join(dirname(reportsPath), "registrations.sqlite");
  if (!existsSync(reportsPath) || !existsSync(candidatePath)) return null;

  const reports = new Database(reportsPath, { readonly: true, fileMustExist: true });
  try {
    const embeddedRegistrationTable = reports.prepare(`
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name IN ('registrations', 'registration_items')
      LIMIT 1
    `).get();
    return embeddedRegistrationTable ? null : candidatePath;
  } finally {
    reports.close();
  }
}
