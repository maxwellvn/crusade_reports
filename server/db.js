import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.CRUSADE_DB_PATH || join(__dirname, "..", "data", "reports.sqlite");

// A restore upload is staged first and applied only during a clean process
// restart, before any connection opens. Preserve the displaced database beside
// normal backups as a final rollback point.
const pendingRestore = join(dirname(DB_PATH), ".restore-pending.sqlite");
if (existsSync(pendingRestore)) {
  const candidate = new Database(pendingRestore, { readonly: true, fileMustExist: true });
  const integrity = candidate.pragma("quick_check", { simple: true });
  candidate.close();
  if (integrity !== "ok") throw new Error(`Pending database restore failed integrity verification: ${integrity}`);
  const backupDir = process.env.DB_BACKUP_DIR || join(dirname(DB_PATH), "backups");
  mkdirSync(backupDir, { recursive: true });
  if (existsSync(DB_PATH)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    renameSync(DB_PATH, join(backupDir, `pre-restore-${stamp}.sqlite`));
  }
  for (const sidecar of [`${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    if (existsSync(sidecar)) unlinkSync(sidecar);
  }
  renameSync(pendingRestore, DB_PATH);
}

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL"); // crash-safe; survives power loss mid-write
db.pragma("foreign_keys = ON");

export const METRIC_FIELDS = [
  "salvation", "holy_spirit_filled", "water_baptisms", "ror_distributed", "bibles_distributed",
  "online_participation", "radio_tv_reach", "testimonies_recorded", "tap2read_distributed",
  "ntyba_distributed", "healing_nations_magazine",
  "rabah_crusades", "rabah_people_reached",
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
    crusade_expense   REAL NOT NULL DEFAULT 0,

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
    rabah_crusades           INTEGER NOT NULL DEFAULT 0,
    rabah_people_reached     INTEGER NOT NULL DEFAULT 0,

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
    -- 'public' = the standard crusade-registration form; 'blue_elite' = the
    -- Loveworld Blue Elite staff module. Existing rows default to 'public' so
    -- the original admin views stay unchanged.
    program           TEXT NOT NULL DEFAULT 'public',
    department        TEXT,
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

    -- Mirror of registrations.program so item-level queries (live feed, exports)
    -- can filter by module without joining back to the parent row.
    program           TEXT NOT NULL DEFAULT 'public',

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
    readiness_updated_at TEXT,

    -- network-only, per crusade (see migration below). Collaboration are
    -- comma-joined lists; the planning fields are free text / a count / a choice.
    crusade_collaborators TEXT,
    zone_contribution     TEXT,
    estimated_budget          TEXT,
    rhapsody_copies_confirmed TEXT,
    permits_obtained          TEXT,
    media_coverage_plan       TEXT
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

  CREATE TABLE IF NOT EXISTS dashboard_permissions (
    username  TEXT NOT NULL COLLATE NOCASE,
    page_key  TEXT NOT NULL,
    PRIMARY KEY (username, page_key)
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO app_settings (key, value) VALUES ('reporting_open', '1');
  INSERT OR IGNORE INTO app_settings (key, value) VALUES ('default_landing_page', '/registrations/live');
  INSERT OR IGNORE INTO app_settings (key, value) VALUES ('mission_nation_selection_open', '1');

  CREATE TABLE IF NOT EXISTS mission_nation_selections (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_code        TEXT NOT NULL UNIQUE,
    pastor_name         TEXT NOT NULL,
    zone_name           TEXT NOT NULL COLLATE NOCASE UNIQUE,
    home_country_code   TEXT NOT NULL,
    home_country_name   TEXT NOT NULL,
    mission_country_code TEXT NOT NULL,
    mission_country_name TEXT NOT NULL,
    assigned_country_code TEXT,
    assigned_country_name TEXT,
    assignment_updated_at TEXT,
    assigned_by           TEXT,
    contact_email       TEXT NOT NULL,
    phone_country_code  TEXT NOT NULL,
    phone_number        TEXT NOT NULL,
    kingschat_username  TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mission_selections_created ON mission_nation_selections(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_mission_selections_pastor ON mission_nation_selections(pastor_name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_mission_selections_preference ON mission_nation_selections(mission_country_code);

  CREATE TABLE IF NOT EXISTS resource_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO resource_categories (name) VALUES
    ('Teaching'), ('Campaign Materials'), ('Training'), ('Music'), ('Media'), ('Documents'), ('Other');

  -- Public NOTC resource library. Files live outside the client bundle and are
  -- referenced by an unguessable stored filename; original names are metadata.
  CREATE TABLE IF NOT EXISTS resources (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    description   TEXT,
    category      TEXT NOT NULL DEFAULT 'other',
    resource_type TEXT NOT NULL,
    external_url  TEXT,
    stored_name   TEXT,
    original_name TEXT,
    mime_type     TEXT,
    file_size     INTEGER,
    created_by    TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (resource_type IN ('link','image','video','document','audio','other')),
    CHECK ((external_url IS NOT NULL AND stored_name IS NULL) OR
           (external_url IS NULL AND stored_name IS NOT NULL))
  );
  CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(resource_type);
  CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
  CREATE INDEX IF NOT EXISTS idx_resources_created ON resources(created_at DESC);
  INSERT OR IGNORE INTO resource_categories (name)
    SELECT DISTINCT category FROM resources WHERE trim(category) <> '';

  CREATE INDEX IF NOT EXISTS idx_reg_items_reg     ON registration_items(registration_id);
  CREATE INDEX IF NOT EXISTS idx_reg_items_type    ON registration_items(event_type);
  CREATE INDEX IF NOT EXISTS idx_reg_items_zone    ON registration_items(zone);
  CREATE INDEX IF NOT EXISTS idx_reg_items_country ON registration_items(country);
  CREATE INDEX IF NOT EXISTS idx_reg_items_place   ON registration_items(city_place_id);
`);

// Mission-nation preferences were initially exclusive per nation. Rebuild once
// so many zones can express interest in the same nation while admins make a
// separate final assignment decision.
const missionSelectionSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mission_nation_selections'").get()?.sql || "";
if (/mission_country_code\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(missionSelectionSql)) {
  db.transaction(() => {
    db.exec(`
      ALTER TABLE mission_nation_selections RENAME TO mission_nation_selections_exclusive;
      CREATE TABLE mission_nation_selections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_code TEXT NOT NULL UNIQUE,
        pastor_name TEXT NOT NULL,
        zone_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        home_country_code TEXT NOT NULL,
        home_country_name TEXT NOT NULL,
        mission_country_code TEXT NOT NULL,
        mission_country_name TEXT NOT NULL,
        assigned_country_code TEXT,
        assigned_country_name TEXT,
        assignment_updated_at TEXT,
        assigned_by TEXT,
        contact_email TEXT NOT NULL,
        phone_country_code TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        kingschat_username TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO mission_nation_selections
        (id, receipt_code, pastor_name, zone_name, home_country_code, home_country_name,
         mission_country_code, mission_country_name, contact_email, phone_country_code,
         phone_number, kingschat_username, created_at)
      SELECT id, receipt_code, pastor_name, zone_name, home_country_code, home_country_name,
         mission_country_code, mission_country_name, contact_email, phone_country_code,
         phone_number, kingschat_username, created_at
      FROM mission_nation_selections_exclusive;
      DROP TABLE mission_nation_selections_exclusive;
      CREATE INDEX idx_mission_selections_created ON mission_nation_selections(created_at DESC);
      CREATE INDEX idx_mission_selections_pastor ON mission_nation_selections(pastor_name COLLATE NOCASE);
      CREATE INDEX idx_mission_selections_preference ON mission_nation_selections(mission_country_code);
      CREATE INDEX idx_mission_selections_assignment ON mission_nation_selections(assigned_country_code);
    `);
  })();
} else {
  const missionCols = new Set(db.prepare("PRAGMA table_info(mission_nation_selections)").all().map((column) => column.name));
  for (const column of ["assigned_country_code", "assigned_country_name", "assignment_updated_at", "assigned_by"]) {
    if (!missionCols.has(column)) db.exec(`ALTER TABLE mission_nation_selections ADD COLUMN ${column} TEXT`);
  }
}
db.exec("CREATE INDEX IF NOT EXISTS idx_mission_selections_assignment ON mission_nation_selections(assigned_country_code)");

const resourceColumns = new Set(db.prepare("PRAGMA table_info(resources)").all().map((column) => column.name));
if (!resourceColumns.has("thumbnail_url")) db.exec("ALTER TABLE resources ADD COLUMN thumbnail_url TEXT");

db.exec(`
  CREATE TABLE IF NOT EXISTS media_training_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_code TEXT NOT NULL UNIQUE,
    organization_name TEXT NOT NULL,
    primary_timezone TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS media_training_trainees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    registration_id INTEGER NOT NULL REFERENCES media_training_registrations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Presenter', 'Cameraman', 'Technical Personnel')),
    email TEXT NOT NULL,
    kingschat_username TEXT NOT NULL,
    phone_country_code TEXT NOT NULL,
    phone_number TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_media_training_created ON media_training_registrations(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_media_training_trainees_registration ON media_training_trainees(registration_id);
  CREATE INDEX IF NOT EXISTS idx_media_training_trainees_role ON media_training_trainees(role);
`);
const mediaTrainingColumns = new Set(db.prepare("PRAGMA table_info(media_training_registrations)").all().map((column) => column.name));
if (!mediaTrainingColumns.has("zone_name")) {
  db.exec("ALTER TABLE media_training_registrations ADD COLUMN zone_name TEXT");
  db.exec("UPDATE media_training_registrations SET zone_name = organization_name WHERE zone_name IS NULL");
}
for (const column of ["group_name", "church_name"]) {
  if (!mediaTrainingColumns.has(column)) db.exec(`ALTER TABLE media_training_registrations ADD COLUMN ${column} TEXT`);
}
for (const column of ["church_country_code", "church_country_name", "church_city", "church_city_place_id"]) {
  if (!mediaTrainingColumns.has(column)) db.exec(`ALTER TABLE media_training_registrations ADD COLUMN ${column} TEXT`);
}
db.exec("UPDATE media_training_registrations SET church_name = organization_name WHERE church_name IS NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_media_training_zone ON media_training_registrations(zone_name COLLATE NOCASE)");

db.exec(`
  CREATE TABLE IF NOT EXISTS mission_trip_volunteers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_code TEXT NOT NULL UNIQUE,
    designation TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone_country_code TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    kingschat_username TEXT NOT NULL,
    zone_name TEXT,
    group_name TEXT,
    church_name TEXT,
    passport_country_code TEXT NOT NULL,
    passport_country_name TEXT NOT NULL,
    additional_passports TEXT,
    passport_expiry TEXT NOT NULL,
    preferred_destination_code TEXT NOT NULL,
    preferred_destination_name TEXT NOT NULL,
    ready_for_any_destination INTEGER NOT NULL DEFAULT 0,
    valid_passport INTEGER NOT NULL DEFAULT 0,
    covers_travel_expenses INTEGER NOT NULL DEFAULT 0,
    medically_fit INTEGER NOT NULL DEFAULT 0,
    sponsor_interest INTEGER NOT NULL DEFAULT 0,
    partnership_acknowledged INTEGER NOT NULL DEFAULT 0,
    additional_information TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mission_trip_created ON mission_trip_volunteers(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_mission_trip_zone ON mission_trip_volunteers(zone_name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_mission_trip_passport ON mission_trip_volunteers(passport_country_code);
  CREATE INDEX IF NOT EXISTS idx_mission_trip_destination ON mission_trip_volunteers(preferred_destination_code);

  CREATE TABLE IF NOT EXISTS upcoming_crusade_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    zone_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    group_name TEXT,
    email TEXT NOT NULL,
    kingschat_username TEXT NOT NULL,
    phone_country_code TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    passport_country_code TEXT NOT NULL,
    passport_country_name TEXT NOT NULL,
    passport_expiry TEXT NOT NULL,
    opportunity_code TEXT NOT NULL,
    opportunity_nation TEXT NOT NULL,
    opportunity_dates TEXT NOT NULL,
    opportunity_names TEXT NOT NULL,
    opportunity_types TEXT NOT NULL,
    opportunity_cities TEXT NOT NULL,
    second_opportunity_code TEXT,
    second_opportunity_nation TEXT,
    second_opportunity_dates TEXT,
    second_opportunity_names TEXT,
    second_opportunity_types TEXT,
    second_opportunity_cities TEXT,
    valid_passport INTEGER NOT NULL DEFAULT 1,
    destination_access INTEGER NOT NULL DEFAULT 1,
    available_to_travel INTEGER NOT NULL DEFAULT 1,
    additional_information TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_upcoming_interest_created ON upcoming_crusade_interests(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_upcoming_interest_destination ON upcoming_crusade_interests(opportunity_code);
  CREATE INDEX IF NOT EXISTS idx_upcoming_interest_passport ON upcoming_crusade_interests(passport_country_code);
`);

const upcomingInterestColumns = new Set(db.prepare("PRAGMA table_info(upcoming_crusade_interests)").all().map((column) => column.name));
for (const column of ["second_opportunity_code", "second_opportunity_nation", "second_opportunity_dates", "second_opportunity_names", "second_opportunity_types", "second_opportunity_cities"]) {
  if (!upcomingInterestColumns.has(column)) db.exec(`ALTER TABLE upcoming_crusade_interests ADD COLUMN ${column} TEXT`);
}

// Custom media roles require removing the original three-role CHECK while
// preserving every existing trainee and its registration relationship.
const mediaTraineeSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'media_training_trainees'").get()?.sql || "";
if (/CHECK\s*\(\s*role\s+IN/i.test(mediaTraineeSql)) {
  db.transaction(() => db.exec(`
    ALTER TABLE media_training_trainees RENAME TO media_training_trainees_fixed_roles;
    CREATE TABLE media_training_trainees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL REFERENCES media_training_registrations(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT NOT NULL,
      kingschat_username TEXT NOT NULL,
      phone_country_code TEXT NOT NULL,
      phone_number TEXT NOT NULL
    );
    INSERT INTO media_training_trainees SELECT * FROM media_training_trainees_fixed_roles;
    DROP TABLE media_training_trainees_fixed_roles;
    CREATE INDEX idx_media_training_trainees_registration ON media_training_trainees(registration_id);
    CREATE INDEX idx_media_training_trainees_role ON media_training_trainees(role);
  `))();
}
const mediaTraineeColumns = new Set(db.prepare("PRAGMA table_info(media_training_trainees)").all().map((column) => column.name));
if (!mediaTraineeColumns.has("languages_spoken")) db.exec("ALTER TABLE media_training_trainees ADD COLUMN languages_spoken TEXT");

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
const missionSelectionCols = new Set(db.prepare("PRAGMA table_info(mission_nation_selections)").all().map((c) => c.name));
if (!missionSelectionCols.has("minister_type")) db.exec("ALTER TABLE mission_nation_selections ADD COLUMN minister_type TEXT NOT NULL DEFAULT 'zonal_pastor'");
if (!missionSelectionCols.has("ministry_name")) db.exec("ALTER TABLE mission_nation_selections ADD COLUMN ministry_name TEXT");
// Manual organisation names are retained separately from directory-backed
// selections so admins can review and reconcile them later.
for (const [table, cols] of [["registrations", ["zone_manual", "group_manual"]], ["registration_items", ["zone_manual", "group_manual"]]]) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const col of cols) if (!existing.has(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
}
if (!registrationCols.has("confirmation_status")) {
  db.exec(`
    ALTER TABLE registrations ADD COLUMN confirmation_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE registrations ADD COLUMN confirmation_feedback TEXT;
    ALTER TABLE registrations ADD COLUMN confirmation_updated_at TEXT;
  `);
}
// Blue Elite module: program tags each row to its source form; department is
// Blue Elite-only. Both nullable/defaulted so older rows stay 'public' with no
// department, leaving the original admin views unchanged.
if (!registrationCols.has("program")) {
  db.exec(`
    ALTER TABLE registrations ADD COLUMN program TEXT NOT NULL DEFAULT 'public';
    ALTER TABLE registrations ADD COLUMN department TEXT;
  `);
}
const registrationItemColsForProgram = new Set(db.prepare("PRAGMA table_info(registration_items)").all().map((c) => c.name));
if (!registrationItemColsForProgram.has("program")) {
  db.exec(`ALTER TABLE registration_items ADD COLUMN program TEXT NOT NULL DEFAULT 'public'`);
}

const registrationItemCols = new Set(db.prepare("PRAGMA table_info(registration_items)").all().map((c) => c.name));
for (const col of ["event_name", "event_date", "venue", "readiness_notes", "readiness_updated_at"]) {
  if (!registrationItemCols.has(col)) db.exec(`ALTER TABLE registration_items ADD COLUMN ${col} TEXT`);
}
// Network-only, per individual crusade. Collaboration fields hold comma-joined
// lists (collaborating zones/networks and what they contribute); the planning
// fields capture budget, confirmed Rhapsody copies, whether permits are obtained,
// and the media coverage plan. All nullable so non-network and older rows stay empty.
for (const col of ["crusade_collaborators", "zone_contribution",
  "estimated_budget", "rhapsody_copies_confirmed", "permits_obtained", "media_coverage_plan"]) {
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

// RABAH crusade metrics — added for the RABAH crusade type.
if (!crusadeCols.includes("rabah_crusades")) {
  db.exec(`
    ALTER TABLE crusades ADD COLUMN rabah_crusades INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE crusades ADD COLUMN rabah_people_reached INTEGER NOT NULL DEFAULT 0;
  `);
}
if (!db.prepare("PRAGMA table_info(crusades)").all().some((column) => column.name === "crusade_expense")) {
  db.exec("ALTER TABLE crusades ADD COLUMN crusade_expense REAL NOT NULL DEFAULT 0");
}

// Report media: photo/video links plus uploaded photo files under data/report-photos.
const reportCols = new Set(db.prepare("PRAGMA table_info(reports)").all().map((c) => c.name));
if (!reportCols.has("photo_links")) db.exec("ALTER TABLE reports ADD COLUMN photo_links TEXT");
if (!reportCols.has("video_links")) db.exec("ALTER TABLE reports ADD COLUMN video_links TEXT");
db.exec(`
  CREATE TABLE IF NOT EXISTS report_photos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id     INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    stored_name   TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_report_photos_report ON report_photos(report_id);
`);

db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_crusades_registration_item ON crusades(registration_item_id) WHERE registration_item_id IS NOT NULL");
// This backfill must run after the registration_item_id migration above so
// production databases from before private-dashboard reporting can boot.
db.exec(`
  UPDATE crusades SET cell_name = (
    SELECT cell_name FROM registration_items WHERE registration_items.id = crusades.registration_item_id
  ) WHERE registration_item_id IS NOT NULL AND cell_name IS NULL;
  UPDATE reports SET cell_name = (
    SELECT cell_name FROM crusades WHERE crusades.report_id = reports.id AND crusades.cell_name IS NOT NULL LIMIT 1
  ) WHERE cell_name IS NULL;
`);

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
