// One-off: build the registration search index on a live database without
// blocking it. Safe to re-run; only rows missing from the index are added.
//
//   node scripts/build-search-index.mjs /app/data/registrations.sqlite
//
// Run it before deploying the search change (so boot has nothing to build)
// and again afterwards to pick up rows written in between.
import Database from "better-sqlite3";
import { registrationSearchSchema, indexMissingRegistrationRows, indexedRowCount, REGISTRATION_SEARCH_TABLES } from "../server/searchIndex.js";

const path = process.argv[2];
if (!path) { console.error("usage: node scripts/build-search-index.mjs <registrations.sqlite>"); process.exit(2); }
const db = new Database(path, { timeout: 30_000 });
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.exec(registrationSearchSchema());
const startedAt = Date.now();
let lastLine = "";
const totals = indexMissingRegistrationRows(db, {
  onBatch: ({ table, upTo, maxId, indexed }) => {
    const line = `${table}: ${upTo}/${maxId} ids scanned, ${indexed} indexed, ${Math.round((Date.now() - startedAt) / 1000)}s`;
    if (line !== lastLine) process.stdout.write(`\r${line}`);
    lastLine = line;
  },
});
process.stdout.write("\n");
for (const [table, fts] of REGISTRATION_SEARCH_TABLES) {
  const rows = db.prepare(`SELECT COUNT(*) AS value FROM ${table}`).get().value;
  console.log(`${table}: ${rows} rows, ${indexedRowCount(db, fts)} indexed (+${totals[table]} this run)`);
}
db.close();
