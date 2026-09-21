// Registration search index (FTS5 trigram). Shared by db.js (schema at boot)
// and scripts/build-search-index.mjs (one-off batched build on a live database).
//
// The admin table's free-text box used to run a 16-column LIKE '%term%' over
// registrations ⋈ registration_items, a full scan of 2M+ rows per keystroke.
// Trigram FTS gives the same substring, case-insensitive semantics through an
// index. Tokens shorter than three characters keep the LIKE path.

export const REGISTRATION_ITEM_SEARCH_COLS = ["country", "city", "event_type", "event_name", "venue", "readiness_status", "readiness_notes"];
export const REGISTRATION_SEARCH_COLS = ["zone", "group_name", "church_name", "network_name", "country", "contact_name", "contact_email", "phone_country_code", "phone_number", "kingschat_username"];
export const REGISTRATION_SEARCH_TABLES = [
  ["registration_items", "registration_items_fts", REGISTRATION_ITEM_SEARCH_COLS],
  ["registrations", "registrations_fts", REGISTRATION_SEARCH_COLS],
];

function ftsSync(prefix, table, fts, cols) {
  const list = cols.join(", ");
  return `
    CREATE VIRTUAL TABLE IF NOT EXISTS ${prefix}${fts} USING fts5(${list}, content='${table}', content_rowid='id', tokenize='trigram');
    CREATE TRIGGER IF NOT EXISTS ${prefix}${fts}_ai AFTER INSERT ON ${table} BEGIN
      INSERT INTO ${fts}(rowid, ${list}) VALUES (new.id, ${cols.map((c) => "new." + c).join(", ")});
    END;
    CREATE TRIGGER IF NOT EXISTS ${prefix}${fts}_ad AFTER DELETE ON ${table} BEGIN
      INSERT INTO ${fts}(${fts}, rowid, ${list}) VALUES ('delete', old.id, ${cols.map((c) => "old." + c).join(", ")});
    END;
    CREATE TRIGGER IF NOT EXISTS ${prefix}${fts}_au AFTER UPDATE ON ${table} BEGIN
      INSERT INTO ${fts}(${fts}, rowid, ${list}) VALUES ('delete', old.id, ${cols.map((c) => "old." + c).join(", ")});
      INSERT INTO ${fts}(rowid, ${list}) VALUES (new.id, ${cols.map((c) => "new." + c).join(", ")});
    END;
  `;
}

// Tables + triggers. Idempotent; instant on an existing database.
export function registrationSearchSchema(prefix = "") {
  return REGISTRATION_SEARCH_TABLES.map(([table, fts, cols]) => ftsSync(prefix, table, fts, cols)).join("\n");
}

// Rows the index knows about. COUNT(*) on an external-content FTS table reads
// the content table, so the docsize shadow table is the honest count.
export function indexedRowCount(db, fts) {
  return db.prepare(`SELECT COUNT(*) AS value FROM ${fts}_docsize`).get().value;
}

// Index every row the shadow table does not yet hold, in short transactions
// so concurrent writers wait milliseconds rather than the whole build.
export function indexMissingRegistrationRows(db, { batchSize = 20_000, onBatch } = {}) {
  const totals = {};
  for (const [table, fts, cols] of REGISTRATION_SEARCH_TABLES) {
    const list = cols.join(", ");
    const maxId = db.prepare(`SELECT COALESCE(MAX(id), 0) AS value FROM ${table}`).get().value;
    const insert = db.prepare(`
      INSERT INTO ${fts}(rowid, ${list})
      SELECT id, ${list} FROM ${table} t
      WHERE t.id > ? AND t.id <= ? AND NOT EXISTS (SELECT 1 FROM ${fts}_docsize d WHERE d.id = t.id)
    `);
    const batch = db.transaction((from, to) => insert.run(from, to).changes);
    let indexed = 0;
    for (let from = 0; from < maxId; from += batchSize) {
      indexed += batch(from, Math.min(from + batchSize, maxId));
      onBatch?.({ table, upTo: Math.min(from + batchSize, maxId), maxId, indexed });
    }
    totals[table] = indexed;
  }
  return totals;
}
