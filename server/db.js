import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "data", "reports.sqlite");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL"); // crash-safe; survives power loss mid-write
db.pragma("foreign_keys = ON");

export const METRIC_FIELDS = [
  "salvation", "holy_spirit_filled", "water_baptisms", "ror_distributed", "bibles_distributed",
  "online_participation", "radio_tv_reach", "testimonies_recorded", "tap2read_distributed",
  "ntyba_distributed", "healing_nations_magazine",
];

// reports = submitter/context (one submission). crusades = the FACT TABLE: one row
// per crusade, the single source of truth. Every metric is stored ONCE, per crusade;
// all dashboards aggregate from here (GROUP BY category / city / zone / month) — no
// derived columns to drift, no JSON to parse. Attribution (zone/group/church/network)
// is denormalized onto each crusade so any hierarchy level rolls up with a plain SUM.
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    organization_type TEXT NOT NULL,
    zone              TEXT,
    group_name        TEXT,
    church_name       TEXT,
    cell_name         TEXT,
    network_name      TEXT,
    network_type      TEXT,
    country           TEXT NOT NULL,
    contact_name      TEXT,
    contact_email     TEXT,
    phone_country_code TEXT,
    phone_number      TEXT,
    kingschat_username TEXT,
    contact_address   TEXT,
    highlights        TEXT,
    media_links       TEXT
  );

  CREATE TABLE IF NOT EXISTS crusades (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id         INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),

    -- attribution (denormalized from the report for direct GROUP BY)
    organization_type TEXT NOT NULL,
    zone              TEXT,
    group_name        TEXT,
    church_name       TEXT,
    cell_name         TEXT,
    network_name      TEXT,
    country           TEXT NOT NULL,

    -- the crusade
    format            TEXT NOT NULL DEFAULT 'physical', -- 'physical' | 'online'
    event_type        TEXT NOT NULL,
    other_event_type  TEXT,
    event_name        TEXT,
    city              TEXT NOT NULL,
    city_place_id     TEXT,
    event_date        TEXT NOT NULL,
    attendance        INTEGER NOT NULL DEFAULT 0, -- ONSITE attendance; online attendance lives in online_participation

    salvation                INTEGER NOT NULL DEFAULT 0,
    holy_spirit_filled       INTEGER NOT NULL DEFAULT 0,
    water_baptisms           INTEGER NOT NULL DEFAULT 0,
    ror_distributed          INTEGER NOT NULL DEFAULT 0,
    bibles_distributed       INTEGER NOT NULL DEFAULT 0,
    online_participation     INTEGER NOT NULL DEFAULT 0,
    radio_tv_reach           INTEGER NOT NULL DEFAULT 0,
    testimonies_recorded     INTEGER NOT NULL DEFAULT 0,
    tap2read_distributed     INTEGER NOT NULL DEFAULT 0,
    ntyba_distributed        INTEGER NOT NULL DEFAULT 0,
    healing_nations_magazine INTEGER NOT NULL DEFAULT 0,

    minister_name     TEXT,
    venue             TEXT,
    registration_item_id INTEGER REFERENCES registration_items(id)
  );

  CREATE INDEX IF NOT EXISTS idx_crusades_report  ON crusades(report_id);
  CREATE INDEX IF NOT EXISTS idx_crusades_type    ON crusades(event_type);
  CREATE INDEX IF NOT EXISTS idx_crusades_zone    ON crusades(zone);
  CREATE INDEX IF NOT EXISTS idx_crusades_network ON crusades(network_name);
  CREATE INDEX IF NOT EXISTS idx_crusades_country ON crusades(country);
  CREATE INDEX IF NOT EXISTS idx_crusades_date    ON crusades(event_date);
  CREATE INDEX IF NOT EXISTS idx_crusades_place   ON crusades(city_place_id);

  CREATE TABLE IF NOT EXISTS networks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per dashboard layout: 1 = reports, 2 = live registrations.
  CREATE TABLE IF NOT EXISTS dashboard_layout (
    id     INTEGER PRIMARY KEY,
    layout TEXT NOT NULL
  );

  -- Crusade registration: pre-crusade intent, the twin of reports/crusades.
  -- registrations = one submission ("Zone X plans crusades for <plan_date>");
  -- registration_items = the fact table, one row per individual crusade.
  -- Legacy aggregate rows retain planned_count; new rows always store 1.
  CREATE TABLE IF NOT EXISTS registrations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    organization_type TEXT NOT NULL,
    zone              TEXT,
    group_name        TEXT,
    church_name       TEXT,
    cell_name         TEXT,
    network_name      TEXT,
    country           TEXT NOT NULL,
    plan_date         TEXT NOT NULL,
    contact_name      TEXT,
    contact_email     TEXT,
    phone_country_code TEXT,
    phone_number      TEXT,
    kingschat_username TEXT,
    contact_address   TEXT,
    confirmation_status TEXT NOT NULL DEFAULT 'pending',
    confirmation_feedback TEXT,
    confirmation_updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS registration_items (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    registration_id   INTEGER NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),

    -- attribution (denormalized, same as crusades)
    organization_type TEXT NOT NULL,
    zone              TEXT,
    group_name        TEXT,
    church_name       TEXT,
    cell_name         TEXT,
    network_name      TEXT,
    country           TEXT NOT NULL,
    plan_date         TEXT NOT NULL,

    event_type        TEXT NOT NULL,
    planned_count     INTEGER NOT NULL DEFAULT 0,
    event_name        TEXT,
    event_date        TEXT,
    venue             TEXT,
    expected_attendance INTEGER NOT NULL DEFAULT 0,
    minister_name     TEXT,
    city              TEXT,
    city_place_id     TEXT,
    city_lat          REAL,
    city_lng          REAL,
    readiness_status  TEXT NOT NULL DEFAULT 'pending',
    readiness_notes   TEXT,
    readiness_updated_at TEXT
  );

  -- Capability links for per-zone dashboards: an unguessable token maps to one
  -- zone; the portal endpoint scopes every query to it. Admin-only generation.
  CREATE TABLE IF NOT EXISTS zone_tokens (
    zone       TEXT PRIMARY KEY,
    token      TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dashboard_accounts (
    username   TEXT PRIMARY KEY COLLATE NOCASE,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO app_settings (key, value) VALUES ('reporting_open', '1');

  CREATE INDEX IF NOT EXISTS idx_reg_items_reg     ON registration_items(registration_id);
  CREATE INDEX IF NOT EXISTS idx_reg_items_type    ON registration_items(event_type);
  CREATE INDEX IF NOT EXISTS idx_reg_items_zone    ON registration_items(zone);
  CREATE INDEX IF NOT EXISTS idx_reg_items_country ON registration_items(country);
  CREATE INDEX IF NOT EXISTS idx_reg_items_place   ON registration_items(city_place_id);
`);

// Older databases restricted this table to id=1. Rebuild it once so the Live
// Registrations dashboard can persist its separate id=2 layout.
const dashboardLayoutSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dashboard_layout'").get()?.sql || "";
if (/CHECK\s*\(\s*id\s*=\s*1\s*\)/i.test(dashboardLayoutSql)) {
  db.transaction(() => {
    db.exec(`
      ALTER TABLE dashboard_layout RENAME TO dashboard_layout_single;
      CREATE TABLE dashboard_layout (id INTEGER PRIMARY KEY, layout TEXT NOT NULL);
      INSERT INTO dashboard_layout (id, layout) SELECT id, layout FROM dashboard_layout_single;
      DROP TABLE dashboard_layout_single;
    `);
  })();
}

// @maxwellvn is the fixed super admin. This identifier is public account data,
// not a credential; tokens and keys remain runtime-only.
db.prepare("INSERT OR IGNORE INTO dashboard_accounts (username, created_by) VALUES ('maxwellvn', 'system')").run();

// Migration for DBs created before the format column existed. Runs once; the
// backfill marks inherently-virtual crusade types as online.
const crusadeCols = db.prepare("PRAGMA table_info(crusades)").all().map((c) => c.name);
if (!db.prepare("PRAGMA table_info(reports)").all().some((c) => c.name === "cell_name")) {
  db.exec("ALTER TABLE reports ADD COLUMN cell_name TEXT");
}
if (!crusadeCols.includes("cell_name")) {
  db.exec("ALTER TABLE crusades ADD COLUMN cell_name TEXT");
}
if (!crusadeCols.includes("format")) {
  db.exec(`
    ALTER TABLE crusades ADD COLUMN format TEXT NOT NULL DEFAULT 'physical';
    UPDATE crusades SET format = 'online'
      WHERE event_type IN ('tv','radio','social-media','online','mystreamspace');
  `);
}

// Migration: cell org level + per-item minister (mega crusades) on registrations.
if (!db.prepare("PRAGMA table_info(registrations)").all().some((c) => c.name === "cell_name")) {
  db.exec(`
    ALTER TABLE registrations ADD COLUMN cell_name TEXT;
    ALTER TABLE registration_items ADD COLUMN cell_name TEXT;
    ALTER TABLE registration_items ADD COLUMN minister_name TEXT;
  `);
}
db.exec(`
  UPDATE crusades SET cell_name = (
    SELECT cell_name FROM registration_items WHERE registration_items.id = crusades.registration_item_id
  ) WHERE registration_item_id IS NOT NULL AND cell_name IS NULL;
  UPDATE reports SET cell_name = (
    SELECT cell_name FROM crusades WHERE crusades.report_id = reports.id AND crusades.cell_name IS NOT NULL LIMIT 1
  ) WHERE cell_name IS NULL;
`);

// Reporter/registrant contact details. Nullable columns preserve older submissions;
// validation requires them for every new one.
const CONTACT_COLS = ["contact_name", "contact_email", "phone_country_code", "phone_number", "kingschat_username", "contact_address"];
for (const table of ["reports", "registrations"]) {
  const cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const col of CONTACT_COLS) {
    if (!cols.has(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`);
  }
}

const registrationCols = new Set(db.prepare("PRAGMA table_info(registrations)").all().map((c) => c.name));
if (!registrationCols.has("confirmation_status")) {
  db.exec(`
    ALTER TABLE registrations ADD COLUMN confirmation_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE registrations ADD COLUMN confirmation_feedback TEXT;
    ALTER TABLE registrations ADD COLUMN confirmation_updated_at TEXT;
  `);
}

const registrationItemCols = new Set(db.prepare("PRAGMA table_info(registration_items)").all().map((c) => c.name));
for (const col of ["event_name", "event_date", "venue", "readiness_notes", "readiness_updated_at"]) {
  if (!registrationItemCols.has(col)) db.exec(`ALTER TABLE registration_items ADD COLUMN ${col} TEXT`);
}
if (!registrationItemCols.has("readiness_status")) {
  db.exec("ALTER TABLE registration_items ADD COLUMN readiness_status TEXT NOT NULL DEFAULT 'pending'");
}
if (!registrationItemCols.has("expected_attendance")) {
  db.exec("ALTER TABLE registration_items ADD COLUMN expected_attendance INTEGER NOT NULL DEFAULT 0");
}

// Canonical network list, seeded at every boot (idempotent — name is UNIQUE).
// New networks added through the registration form persist alongside these.
const NETWORKS = [
  "REACHOUT CAMPAIGNS", "REON", "RIM", "RIN",
  "Say Yes to Kids", "TEEVOLUTION", "TNI", "Youths Aglow",
];
{
  const ins = db.prepare("INSERT OR IGNORE INTO networks (name) VALUES (?)");
  NETWORKS.forEach((n) => ins.run(n));
}

// zone_tokens predates network links: `zone` holds the org name for both kinds;
// `kind` says whether it scopes by zone or by network_name.
const ztCols = db.prepare("PRAGMA table_info(zone_tokens)").all().map((c) => c.name);
if (!ztCols.includes("kind")) {
  db.exec("ALTER TABLE zone_tokens ADD COLUMN kind TEXT NOT NULL DEFAULT 'zone'");
}

// City coordinates for the dashboard geo map — geocoded from city_place_id
// after insert (see backfillCityCoords in routes/places.js).
if (!crusadeCols.includes("city_lat")) {
  db.exec(`
    ALTER TABLE crusades ADD COLUMN city_lat REAL;
    ALTER TABLE crusades ADD COLUMN city_lng REAL;
  `);
}

// Reports submitted from a private zone/network dashboard belong to exactly
// one registered crusade. Public reports leave this nullable.
if (!crusadeCols.includes("registration_item_id")) {
  db.exec("ALTER TABLE crusades ADD COLUMN registration_item_id INTEGER REFERENCES registration_items(id)");
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_crusades_registration_item ON crusades(registration_item_id) WHERE registration_item_id IS NOT NULL");

// Full-text search over every human-readable crusade field (FTS5, external
// content). Triggers keep it in sync; the boot-time rebuild covers rows that
// existed before this table did. Backs the search box on /crusades.
const FTS_COLS = ["event_name", "city", "country", "zone", "group_name", "church_name", "network_name", "minister_name", "venue", "event_type", "other_event_type"];
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS crusades_fts USING fts5(
    ${FTS_COLS.join(", ")}, content='crusades', content_rowid='id'
  );
  CREATE TRIGGER IF NOT EXISTS crusades_fts_ai AFTER INSERT ON crusades BEGIN
    INSERT INTO crusades_fts(rowid, ${FTS_COLS.join(", ")})
    VALUES (new.id, ${FTS_COLS.map((c) => "new." + c).join(", ")});
  END;
  CREATE TRIGGER IF NOT EXISTS crusades_fts_ad AFTER DELETE ON crusades BEGIN
    INSERT INTO crusades_fts(crusades_fts, rowid, ${FTS_COLS.join(", ")})
    VALUES ('delete', old.id, ${FTS_COLS.map((c) => "old." + c).join(", ")});
  END;
  CREATE TRIGGER IF NOT EXISTS crusades_fts_au AFTER UPDATE ON crusades BEGIN
    INSERT INTO crusades_fts(crusades_fts, rowid, ${FTS_COLS.join(", ")})
    VALUES ('delete', old.id, ${FTS_COLS.map((c) => "old." + c).join(", ")});
    INSERT INTO crusades_fts(rowid, ${FTS_COLS.join(", ")})
    VALUES (new.id, ${FTS_COLS.map((c) => "new." + c).join(", ")});
  END;
`);
// ponytail: unconditional rebuild each boot — the fact table is small; swap for a
// count check if it ever isn't.
db.exec(`INSERT INTO crusades_fts(crusades_fts) VALUES ('rebuild')`);
