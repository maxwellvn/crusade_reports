import Database from "better-sqlite3";
import { existsSync, renameSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve(process.argv[2] || "");
const outputPath = resolve(process.argv[3] || "");
const temporaryPath = `${outputPath}.pending`;

if (!process.argv[2] || !process.argv[3]) {
  throw new Error("Usage: node scripts/extract-reports-database.js <source.sqlite> <reports.sqlite>");
}
if (!existsSync(sourcePath)) throw new Error(`Source database does not exist: ${sourcePath}`);
if (existsSync(outputPath)) throw new Error(`Refusing to overwrite existing database: ${outputPath}`);
if (existsSync(temporaryPath)) unlinkSync(temporaryPath);

const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
source.pragma("query_only = ON");
if (source.pragma("quick_check", { simple: true }) !== "ok") throw new Error("Source database failed quick_check");
const expected = {
  reports: source.prepare("SELECT COUNT(*) AS value FROM reports").get().value,
  crusades: source.prepare("SELECT COUNT(*) AS value FROM crusades").get().value,
  linked_crusades: source.prepare("SELECT COUNT(*) AS value FROM crusades WHERE registration_item_id IS NOT NULL").get().value,
};

try {
  await source.backup(temporaryPath);
  const target = new Database(temporaryPath);
  try {
    target.pragma("journal_mode = DELETE");
    target.pragma("foreign_keys = OFF");
    const crusadesSql = target.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'crusades'").get()?.sql;
    if (!crusadesSql) throw new Error("Missing crusades schema");
    const rebuiltSql = crusadesSql.replace(
      /registration_item_id\s+INTEGER\s+REFERENCES\s+registration_items\s*\(\s*id\s*\)/i,
      "registration_item_id INTEGER",
    );
    if (rebuiltSql === crusadesSql) throw new Error("Expected crusades.registration_item_id foreign key was not found");
    const columns = target.prepare("PRAGMA table_info(crusades)").all().map((column) => `"${column.name.replaceAll('"', '""')}"`).join(", ");
    const objects = target.prepare(`
      SELECT type, name, sql FROM sqlite_master
      WHERE tbl_name = 'crusades' AND type IN ('index', 'trigger') AND sql IS NOT NULL
      ORDER BY CASE type WHEN 'index' THEN 1 ELSE 2 END, name
    `).all();

    target.exec("BEGIN IMMEDIATE");
    for (const object of objects.filter((entry) => entry.type === "trigger")) {
      target.exec(`DROP TRIGGER IF EXISTS "${object.name.replaceAll('"', '""')}"`);
    }
    target.exec("ALTER TABLE crusades RENAME TO crusades_with_registration_fk");
    target.exec(rebuiltSql);
    target.exec(`INSERT INTO crusades (${columns}) SELECT ${columns} FROM crusades_with_registration_fk`);
    target.exec("DROP TABLE crusades_with_registration_fk");
    for (const object of objects) target.exec(object.sql);
    target.exec("DROP TABLE registration_items");
    target.exec("DROP TABLE registrations");
    target.exec("COMMIT");
    target.exec("VACUUM");
    target.pragma("foreign_keys = ON");

    const actual = {
      reports: target.prepare("SELECT COUNT(*) AS value FROM reports").get().value,
      crusades: target.prepare("SELECT COUNT(*) AS value FROM crusades").get().value,
      linked_crusades: target.prepare("SELECT COUNT(*) AS value FROM crusades WHERE registration_item_id IS NOT NULL").get().value,
    };
    for (const key of Object.keys(expected)) {
      if (actual[key] !== expected[key]) throw new Error(`${key} mismatch: expected ${expected[key]}, got ${actual[key]}`);
    }
    if (target.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name IN ('registrations','registration_items') LIMIT 1").get()) {
      throw new Error("Registration tables remain in extracted reports database");
    }
    const brokenReports = target.prepare(`
      SELECT COUNT(*) AS value FROM crusades c LEFT JOIN reports r ON r.id = c.report_id WHERE r.id IS NULL
    `).get().value;
    if (brokenReports) throw new Error(`Extracted reports database has ${brokenReports} orphan crusades`);
    if (target.pragma("foreign_key_check").length) throw new Error("Extracted reports database has foreign-key errors");
    if (target.pragma("quick_check", { simple: true }) !== "ok") throw new Error("Extracted reports database failed quick_check");
    target.close();
  } catch (error) {
    try { target.exec("ROLLBACK"); } catch {}
    target.close();
    throw error;
  }
  source.close();
  renameSync(temporaryPath, outputPath);
  process.stdout.write(`${JSON.stringify({ source: sourcePath, output: outputPath, expected }, null, 2)}\n`);
} catch (error) {
  source.close();
  if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  throw error;
}
