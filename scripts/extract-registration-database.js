import Database from "better-sqlite3";
import { existsSync, renameSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve(process.argv[2] || "");
const outputPath = resolve(process.argv[3] || "");
const temporaryPath = `${outputPath}.pending`;
const TABLES = ["registrations", "registration_items"];

if (!process.argv[2] || !process.argv[3]) {
  throw new Error("Usage: node scripts/extract-registration-database.js <source.sqlite> <registrations.sqlite>");
}
if (!existsSync(sourcePath)) throw new Error(`Source database does not exist: ${sourcePath}`);
if (existsSync(outputPath)) throw new Error(`Refusing to overwrite existing database: ${outputPath}`);
if (existsSync(temporaryPath)) unlinkSync(temporaryPath);

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
source.pragma("query_only = ON");
if (source.pragma("quick_check", { simple: true }) !== "ok") throw new Error("Source database failed quick_check");

const expected = Object.fromEntries(TABLES.map((table) => {
  const columns = source.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((column) => column.name);
  const summary = source.prepare(`
    SELECT COUNT(*) AS rows, MIN(id) AS min_id, MAX(id) AS max_id
    FROM ${quoteIdentifier(table)}
  `).get();
  return [table, { columns, ...summary }];
}));
expected.registration_items.planned = source.prepare("SELECT COALESCE(SUM(planned_count), 0) AS value FROM registration_items").get().value;

const target = new Database(temporaryPath);
try {
  target.pragma("journal_mode = DELETE");
  target.pragma("foreign_keys = OFF");
  target.exec("BEGIN IMMEDIATE");
  target.prepare("ATTACH DATABASE ? AS production").run(sourcePath);

  for (const table of TABLES) {
    const schema = source.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)?.sql;
    if (!schema) throw new Error(`Missing source schema for ${table}`);
    target.exec(schema);
    const columnList = expected[table].columns.map(quoteIdentifier).join(", ");
    target.exec(`INSERT INTO ${quoteIdentifier(table)} (${columnList}) SELECT ${columnList} FROM production.${quoteIdentifier(table)}`);
  }

  const supportingSchema = source.prepare(`
    SELECT type, name, sql FROM sqlite_master
    WHERE tbl_name IN ('registrations', 'registration_items')
      AND type IN ('index', 'trigger') AND sql IS NOT NULL
    ORDER BY CASE type WHEN 'index' THEN 1 ELSE 2 END, name
  `).all();
  for (const object of supportingSchema) target.exec(object.sql);

  target.exec("COMMIT");
  target.prepare("DETACH DATABASE production").run();
  target.pragma("foreign_keys = ON");

  for (const table of TABLES) {
    const actual = target.prepare(`SELECT COUNT(*) AS rows, MIN(id) AS min_id, MAX(id) AS max_id FROM ${quoteIdentifier(table)}`).get();
    for (const field of ["rows", "min_id", "max_id"]) {
      if (actual[field] !== expected[table][field]) {
        throw new Error(`${table}.${field} mismatch: expected ${expected[table][field]}, got ${actual[field]}`);
      }
    }
  }
  const planned = target.prepare("SELECT COALESCE(SUM(planned_count), 0) AS value FROM registration_items").get().value;
  if (planned !== expected.registration_items.planned) {
    throw new Error(`registration_items planned total mismatch: expected ${expected.registration_items.planned}, got ${planned}`);
  }
  const foreignKeyErrors = target.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyErrors.length) throw new Error(`Extracted database has ${foreignKeyErrors.length} foreign-key errors`);
  if (target.pragma("quick_check", { simple: true }) !== "ok") throw new Error("Extracted database failed quick_check");

  target.close();
  source.close();
  renameSync(temporaryPath, outputPath);
  process.stdout.write(`${JSON.stringify({ source: sourcePath, output: outputPath, expected }, null, 2)}\n`);
} catch (error) {
  try { target.exec("ROLLBACK"); } catch {}
  target.close();
  source.close();
  if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  throw error;
}
