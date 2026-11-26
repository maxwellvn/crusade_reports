#!/usr/bin/env node
// Records what the NOTC portal returns from every campaign-sensitive endpoint, so
// two versions of the code can be proven to give NOTC identical results.
//
//   node scripts/campaign-baseline.mjs record --code <repo dir> --source <reports db> [--registration-source <registrations db>] --out <file.json> [--host notc.rhapsodycrusades.org] [--port 4100] [--seed]
//   node scripts/campaign-baseline.mjs compare <before.json> <after.json>
//
// `record` never touches the source database: it copies it into a temporary
// folder, signs in a throwaway super-admin session inside the copy, starts the
// server from --code against the copy (backups and geocoding off), and records
// every response. Run it once with the old code and once with the new code
// against the same source file, then `compare` the two recordings.

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import AdmZip from "adm-zip";

const SUPER_ADMIN = "maxwellvn";
const SAMPLE_COUNT = 3;
const SNAPSHOT_SETTLE_MS = 90_000;

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) out._.push(argv[i]);
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) out[argv[i].slice(2)] = true;
    else out[argv[i].slice(2)] = argv[i + 1], i += 1;
  }
  return out;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
// The zone-portal template is generated in a worker that can stall on Windows;
// record a timeout instead of abandoning the whole run.
const REQUEST_TIMEOUT_MS = 90_000;
const SERVER_START_TIMEOUT_MS = 10 * 60_000;

function request(port, host, path, { method = "GET", body, cookie } = {}) {
  return new Promise((done, fail) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        Host: host,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => done({ status: res.statusCode, type: String(res.headers["content-type"] || ""), body: Buffer.concat(chunks) }));
    });
    req.on("error", (error) => (error.code === "BASELINE_TIMEOUT" ? done({ status: "timeout", type: "", body: Buffer.alloc(0) }) : fail(error)));
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(Object.assign(new Error(`timeout ${path}`), { code: "BASELINE_TIMEOUT" })));
    if (payload) req.write(payload);
    req.end();
  });
}

// Values that legitimately change between two runs of the same data.
const VOLATILE_KEY = /(^|_)(generated|refreshed|fetched|computed|rendered|exported|checked|last_used)(_at|At)$|^(generatedAt|refreshedAt|now|server_time|duration_ms|took_ms|elapsed_ms|cache_age_ms|stale)$/;

function normalizeJson(value) {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE_KEY.test(key)) continue;
      out[key] = normalizeJson(value[key]);
    }
    return out;
  }
  return value;
}

function todayPatterns() {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const d = now.getDate();
  const m = months[now.getMonth()];
  const y = now.getFullYear();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    new RegExp(`${iso}[T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?Z?`, "g"),
    new RegExp(iso, "g"),
    new RegExp(`\\b0?${d} ${m}(?: ${y})?(?:,? \\d{1,2}:\\d{2}(?::\\d{2})?(?: ?[AP]M)?)?`, "gi"),
    new RegExp(`\\b${m} 0?${d},? ${y}(?:,? \\d{1,2}:\\d{2}(?::\\d{2})?(?: ?[AP]M)?)?`, "gi"),
    new RegExp(`\\b${pad(d)}/${pad(now.getMonth() + 1)}/${y}(?:,? \\d{1,2}:\\d{2}(?::\\d{2})?)?`, "g"),
  ];
}

function normalizeText(text) {
  let out = String(text).replace(/\r\n/g, "\n");
  for (const pattern of todayPatterns()) out = out.replace(pattern, "<today>");
  return out;
}

async function pdfText(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableFontFace: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return pages.map(normalizeText);
}

async function workbookCells(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets.map((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows.push(row.values.slice(1).map((cell) => normalizeText(cell?.text ?? cell?.result ?? (cell instanceof Date ? cell.toISOString() : cell ?? ""))));
    });
    return { name: sheet.name, rows };
  });
}

async function describe(response) {
  const { status, type, body } = response;
  const base = { status, type: type.split(";")[0] };
  try {
    if (type.includes("json")) return { ...base, body: normalizeJson(JSON.parse(body.toString("utf8") || "null")) };
    if (type.includes("pdf")) return { ...base, body: await pdfText(body) };
    if (type.includes("spreadsheetml") || type.includes("officedocument")) return { ...base, body: await workbookCells(body) };
    if (type.includes("zip")) {
      const zip = new AdmZip(body);
      const entries = [];
      for (const entry of zip.getEntries().sort((a, b) => a.entryName.localeCompare(b.entryName))) {
        const data = entry.getData();
        const isSheet = entry.entryName.endsWith(".xlsx");
        entries.push({ name: entry.entryName, body: isSheet ? await workbookCells(data) : normalizeText(data.toString("utf8")) });
      }
      return { ...base, body: entries };
    }
    if (type.startsWith("text/") || type.includes("csv")) return { ...base, body: normalizeText(body.toString("utf8")) };
  } catch (error) {
    return { ...base, parse_error: error.message, sha256: createHash("sha256").update(body).digest("hex") };
  }
  return { ...base, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") };
}

// Deterministic NOTC-shaped fixtures for databases that have little or no data
// (a local dev copy), so totals, lists and exports have something to compare.
// Inserted with the pre-campaign column set, so the same rows work for both
// the old and the new code.
function seedFixtures(db) {
  const at = (day, hour = 9) => `2026-09-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:00:00`;
  const insertRegistration = db.prepare(`INSERT INTO registrations
    (created_at, program, department, organization_type, zone, group_name, church_name, cell_name, network_name, country, plan_date,
     contact_name, contact_email, phone_country_code, phone_number, kingschat_username, confirmation_status)
    VALUES (@created_at, @program, @department, @organization_type, @zone, @group_name, @church_name, @cell_name, @network_name, @country, @plan_date,
     @contact_name, @contact_email, '+234', '8012345678', @kingschat_username, @confirmation_status)`);
  const insertItem = db.prepare(`INSERT INTO registration_items
    (registration_id, created_at, program, organization_type, zone, group_name, church_name, cell_name, network_name, country, plan_date,
     event_type, planned_count, event_name, event_date, venue, expected_attendance, minister_name, city, city_lat, city_lng, readiness_status)
    VALUES (@registration_id, @created_at, @program, @organization_type, @zone, @group_name, @church_name, @cell_name, @network_name, @country, @plan_date,
     @event_type, @planned_count, @event_name, @event_date, @venue, @expected_attendance, @minister_name, @city, @city_lat, @city_lng, @readiness_status)`);
  const insertReport = db.prepare(`INSERT INTO reports
    (created_at, organization_type, zone, group_name, church_name, cell_name, network_name, country, contact_name, contact_email,
     phone_country_code, phone_number, kingschat_username, highlights)
    VALUES (@created_at, @organization_type, @zone, @group_name, @church_name, @cell_name, @network_name, @country, @contact_name, @contact_email,
     '+234', '8012345678', @kingschat_username, @highlights)`);
  const insertCrusade = db.prepare(`INSERT INTO crusades
    (report_id, created_at, organization_type, zone, group_name, church_name, cell_name, network_name, country, format, event_type, event_name,
     city, event_date, attendance, salvation, holy_spirit_filled, water_baptisms, ror_distributed, online_participation, minister_name, venue,
     registration_item_id, city_lat, city_lng)
    VALUES (@report_id, @created_at, @organization_type, @zone, @group_name, @church_name, @cell_name, @network_name, @country, @format, @event_type, @event_name,
     @city, @event_date, @attendance, @salvation, @holy_spirit_filled, @water_baptisms, @ror_distributed, @online_participation, @minister_name, @venue,
     @registration_item_id, @city_lat, @city_lng)`);

  const cities = [
    ["Nigeria", "Lagos", 6.5244, 3.3792], ["Nigeria", "Abuja", 9.0765, 7.3986], ["Ghana", "Accra", 5.6037, -0.187],
    ["Kenya", "Nairobi", -1.2921, 36.8219], ["United Kingdom", "London", 51.5072, -0.1276], ["South Africa", "Johannesburg", -26.2041, 28.0473],
  ];
  const orgs = [
    { organization_type: "zone", zone: "Lagos Zone 1", group_name: null, church_name: null, cell_name: null, network_name: null },
    { organization_type: "church", zone: "Abuja Zone", group_name: "Wuse Group", church_name: "CE Wuse 2", cell_name: null, network_name: null },
    { organization_type: "cell", zone: "Ghana Zone", group_name: "Accra Group", church_name: "CE Osu", cell_name: "Faith Cell", network_name: null },
    { organization_type: "network", zone: null, group_name: null, church_name: null, cell_name: null, network_name: "TNI" },
    { organization_type: "group", zone: "Kenya Zone", group_name: "Nairobi Group", church_name: null, cell_name: null, network_name: null },
    { organization_type: "zone", zone: "UK Zone 2", group_name: null, church_name: null, cell_name: null, network_name: null },
  ];
  const types = ["street", "cellular", "rabah", "online", "school", "hospital"];

  const items = [];
  orgs.forEach((org, index) => {
    const [country, city, lat, lng] = cities[index];
    const registrationId = insertRegistration.run({
      ...org, created_at: at(index + 1), program: "public", department: null, country, plan_date: `2026-12-${String(10 + index).padStart(2, "0")}`,
      contact_name: `Coordinator ${index + 1}`, contact_email: `coordinator${index + 1}@example.org`,
      kingschat_username: `coordinator${index + 1}`, confirmation_status: index % 2 ? "confirmed" : "pending",
    }).lastInsertRowid;
    for (let n = 0; n < 2; n += 1) {
      const itemId = insertItem.run({
        ...org, registration_id: registrationId, created_at: at(index + 1, 10 + n), program: "public", country,
        plan_date: `2026-12-${String(10 + index).padStart(2, "0")}`, event_type: types[(index + n) % types.length], planned_count: 2 + n,
        event_name: `${org.zone || org.network_name} Crusade ${n + 1}`, event_date: `2026-12-${String(10 + index + n).padStart(2, "0")}`,
        venue: `${city} Venue ${n + 1}`, expected_attendance: 500 * (n + 1), minister_name: `Pastor ${index + 1}`,
        city, city_lat: lat, city_lng: lng, readiness_status: n ? "ready" : "pending",
      }).lastInsertRowid;
      items.push({ itemId, org, country, city, lat, lng, type: types[(index + n) % types.length], index, n });
    }
  });

  db.prepare(`INSERT INTO registrations (created_at, program, department, organization_type, zone, country, plan_date, contact_name, contact_email, kingschat_username)
    VALUES (?, 'blue_elite', 'Media', 'zone', 'Lagos Zone 1', 'Nigeria', '2026-12-20', 'Elite Staff', 'elite@example.org', 'elitestaff')`).run(at(7));

  // Reports: half linked to registered crusades, plus unlinked ones and a duplicate pair.
  items.forEach(({ itemId, org, country, city, lat, lng, type, index, n }, position) => {
    if (position % 2) return;
    const reportId = insertReport.run({
      ...org, created_at: at(15 + index), country, contact_name: `Reporter ${index + 1}`,
      contact_email: `reporter${index + 1}@example.org`, kingschat_username: `reporter${index + 1}`, highlights: `Highlights ${index + 1}`,
    }).lastInsertRowid;
    insertCrusade.run({
      ...org, report_id: reportId, created_at: at(15 + index), country, format: index % 3 ? "physical" : "online", event_type: type,
      event_name: `${org.zone || org.network_name} Crusade ${n + 1}`, city, event_date: `2026-12-${String(10 + index + n).padStart(2, "0")}`,
      attendance: 300 + index * 50, salvation: 40 + index, holy_spirit_filled: 10 + index, water_baptisms: 5, ror_distributed: 200 + index * 10,
      online_participation: index % 3 ? 0 : 1200, minister_name: `Pastor ${index + 1}`, venue: `${city} Venue ${n + 1}`,
      registration_item_id: itemId, city_lat: lat, city_lng: lng,
    });
  });
  for (const [label, day] of [["Unlinked Outreach", 25], ["Unlinked Outreach", 25], ["Street Blitz", 26]]) {
    const reportId = insertReport.run({ ...orgs[0], created_at: at(day), country: "Nigeria", contact_name: "Walk-in Reporter",
      contact_email: "walkin@example.org", kingschat_username: "walkin", highlights: null }).lastInsertRowid;
    insertCrusade.run({ ...orgs[0], report_id: reportId, created_at: at(day), country: "Nigeria", format: "physical", event_type: "street",
      event_name: label, city: "Lagos", event_date: "2026-12-05", attendance: 150, salvation: 12, holy_spirit_filled: 3, water_baptisms: 0,
      ror_distributed: 90, online_participation: 0, minister_name: "Pastor Walk", venue: "Lagos Market", registration_item_id: null,
      city_lat: 6.5244, city_lng: 3.3792 });
  }

  db.prepare(`INSERT INTO resources (title, description, category, resource_type, external_url, created_by, created_at, updated_at)
    VALUES ('Crusade Guide', 'Planning guide', 'Guides', 'link', 'https://example.org/guide', 'maxwellvn', ?, ?),
           ('Promo Video', NULL, 'Media', 'video', 'https://example.org/video', 'maxwellvn', ?, ?)`).run(at(2), at(2), at(3), at(3));
  db.prepare("INSERT OR IGNORE INTO zone_tokens (zone, token, created_at) VALUES ('Lagos Zone 1', 'baseline-zone-lagos', ?), ('Abuja Zone', 'baseline-zone-abuja', ?)").run(at(1), at(1));
}

function prepareCopy(source, registrationSource, { seed = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "campaign-baseline-"));
  const file = join(dir, "reports.sqlite");
  copyFileSync(source, file);
  for (const sidecar of ["-wal", "-shm"]) if (existsSync(`${source}${sidecar}`)) copyFileSync(`${source}${sidecar}`, `${file}${sidecar}`);
  const registrationFile = registrationSource ? join(dir, "registrations.sqlite") : null;
  if (registrationFile) {
    copyFileSync(registrationSource, registrationFile);
    for (const sidecar of ["-wal", "-shm"]) {
      if (existsSync(`${registrationSource}${sidecar}`)) copyFileSync(`${registrationSource}${sidecar}`, `${registrationFile}${sidecar}`);
    }
  }

  const token = randomBytes(32).toString("base64url");
  const db = new Database(file);
  const registrationDb = registrationFile ? new Database(registrationFile) : db;
  if (seed) db.transaction(() => seedFixtures(db))();
  db.prepare("INSERT OR IGNORE INTO dashboard_accounts (username, created_by) VALUES (?, 'campaign-baseline')").run(SUPER_ADMIN);
  db.prepare(`INSERT INTO dashboard_sessions (token_hash, username, name, user_id, avatar, expires_at)
    VALUES (?, ?, 'Baseline', '', '', ?)`).run(createHash("sha256").update(token).digest("hex"), SUPER_ADMIN, Date.now() + 86_400_000);

  const pick = (database, sql) => { try { return database.prepare(sql).all(); } catch { return []; } };
  const samples = {
    zoneTokens: pick(db, `SELECT token FROM zone_tokens ORDER BY zone LIMIT ${SAMPLE_COUNT}`).map((r) => r.token),
    crusadeIds: pick(db, `SELECT id FROM crusades ORDER BY id LIMIT ${SAMPLE_COUNT}`).map((r) => r.id),
    reportIds: pick(db, `SELECT id FROM reports ORDER BY id LIMIT ${SAMPLE_COUNT}`).map((r) => r.id),
    emails: pick(registrationDb, `SELECT DISTINCT contact_email AS v FROM registrations WHERE program = 'public' AND contact_email <> '' ORDER BY id LIMIT ${SAMPLE_COUNT}`).map((r) => r.v),
    kingschat: pick(registrationDb, `SELECT DISTINCT kingschat_username AS v FROM registrations WHERE program = 'public' AND kingschat_username <> '' ORDER BY id LIMIT ${SAMPLE_COUNT}`).map((r) => r.v),
  };
  if (registrationDb !== db) registrationDb.close();
  db.close();
  return { dir, file, registrationFile, token, samples };
}

function endpoints(samples, { includeHeavy = false } = {}) {
  const list = [
    "/api/auth/me",
    "/api/campaign-settings",
    "/api/resources",
    "/api/dashboard-layout",
    "/api/stats",
    "/api/stats/rhapsody-distributed",
    "/api/registrations/live",
    "/api/registrations?limit=200",
    "/api/registrations/manual-organizations",
    "/api/registrations/crusade-analysis",
    "/api/registrations/crusade-analysis/export",
    "/api/registrations/countries-without-registrations",
    "/api/registrations/country-report.pdf",
    "/api/crusades?page=1&page_size=100",
    "/api/crusades/duplicates",
    "/api/reports?limit=200",
    "/api/reports/media",
    "/api/coverage",
    "/api/coverage/export",
    "/api/coverage/unregistered-zones/export",
    "/api/country-coverage",
    "/api/country-coverage/ecard-data",
    "/api/country-coverage/export",
    "/api/zone-checklist",
    "/api/zone-checklist/export",
    "/api/blw-campus/overview",
    "/api/blw-campus/registrations",
    "/api/blw-campus/reports",
    "/api/blw-campus/overview/export",
    "/api/collective-report",
    "/api/collective-report/export.pdf",
    "/api/collective-report/export.xlsx",
    "/api/admin/country-consolidation",
    "/api/zone-links",
  ].map((path) => ({ path }));
  if (includeHeavy) {
    list.push(
      { path: "/api/registrations/export" },
      { path: "/api/registrations/export?format=csv" },
      { path: "/api/crusades/export" },
      { path: "/api/blw-campus/registrations/export" },
      { path: "/api/blw-campus/reports/export" },
    );
  }
  for (const id of samples.crusadeIds) list.push({ path: `/api/crusades/${id}/edit` });
  for (const id of samples.reportIds) list.push({ path: `/api/reports/${id}` });
  for (const token of samples.zoneTokens) {
    const suffixes = includeHeavy ? ["", "/export/registrations", "/export/reports", "/report-template"] : [""];
    for (const suffix of suffixes) {
      list.push({ path: `/api/zone-portal/${token}${suffix}`, label: `/api/zone-portal/<zone ${samples.zoneTokens.indexOf(token) + 1}>${suffix}` });
    }
  }
  for (const email of samples.emails) list.push({ path: "/api/registrations/find", method: "POST", body: { lookup: email }, label: `POST /api/registrations/find <email ${samples.emails.indexOf(email) + 1}>` });
  for (const kingschat of samples.kingschat) list.push({ path: "/api/registrations/find", method: "POST", body: { lookup: kingschat }, label: `POST /api/registrations/find <kingschat ${samples.kingschat.indexOf(kingschat) + 1}>` });
  return list;
}

async function waitForServer(port, host, child) {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try { if ((await request(port, host, "/api/health")).status === 200) return; } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`server did not start within ${SERVER_START_TIMEOUT_MS / 1000}s`);
}

// Dashboard snapshots are rebuilt by background workers after boot; wait until
// two consecutive reads agree so both runs compare settled data.
async function waitForSnapshots(port, host, cookie) {
  const probes = ["/api/stats", "/api/registrations/live"];
  const read = async () => JSON.stringify(await Promise.all(probes.map(async (path) => describe(await request(port, host, path, { cookie })))));
  const deadline = Date.now() + SNAPSHOT_SETTLE_MS;
  let previous = await read();
  while (Date.now() < deadline) {
    await sleep(5_000);
    const current = await read();
    if (current === previous && !/pending|refreshing|building/i.test(current.slice(0, 2_000))) return;
    previous = current;
  }
  console.warn("warning: dashboard snapshots did not settle; results may include in-flight data");
}

async function record(opts) {
  const code = resolve(opts.code);
  const source = resolve(opts.source);
  const registrationSource = opts["registration-source"] ? resolve(opts["registration-source"]) : null;
  const host = opts.host || "notc.rhapsodycrusades.org";
  const port = Number(opts.port || 4100);
  if (!existsSync(join(code, "server", "index.js"))) throw new Error(`no server/index.js under ${code}`);
  if (!existsSync(source)) throw new Error(`source database not found: ${source}`);
  if (registrationSource && !existsSync(registrationSource)) throw new Error(`registration database not found: ${registrationSource}`);

  const copy = prepareCopy(source, registrationSource, { seed: Boolean(opts.seed) });
  const cookie = `dashboard_session=${copy.token}`;
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: code,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      CRUSADE_DB_PATH: copy.file,
      REGISTRATION_DB_PATH: copy.registrationFile || "",
      DB_BACKUP_DIR: join(copy.dir, "backups"),
      DB_DISABLE_AUTOMATIC_BACKUPS: "1",
      DB_REQUIRE_PERSISTENT_STORAGE: "0",
      // expenseEvidence.js derives its default from URL.pathname, which is
      // invalid on Windows ("D:\D:\...").
      EXPENSE_EVIDENCE_DIR: join(copy.dir, "expense-evidence"),
      GOOGLE_PLACES_API_KEY: "",
      KINGSCHAT_REDIRECT_URI: "",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4_000); });

  try {
    await waitForServer(port, host, child);
    await waitForSnapshots(port, host, cookie);
    const results = {};
    for (const endpoint of endpoints(copy.samples, { includeHeavy: Boolean(opts["include-heavy"]) })) {
      const name = endpoint.label || `${endpoint.method || "GET"} ${endpoint.path}`.replace(/^GET /, "");
      results[name] = await describe(await request(port, host, endpoint.path, { ...endpoint, cookie }));
      process.stdout.write(`${String(results[name].status).padEnd(4)} ${name}\n`);
    }
    const out = { meta: { code, source, registration_source: registrationSource, host, seeded: Boolean(opts.seed), include_heavy: Boolean(opts["include-heavy"]), recorded_at: new Date().toISOString(), samples: Object.fromEntries(Object.entries(copy.samples).map(([k, v]) => [k, v.length])) }, results };
    writeFileSync(resolve(opts.out), JSON.stringify(out, null, 1));
    console.log(`\nrecorded ${Object.keys(results).length} endpoints -> ${resolve(opts.out)}`);
  } catch (error) {
    console.error(stderr);
    throw error;
  } finally {
    child.kill();
    await sleep(1_000);
    rmSync(copy.dir, { recursive: true, force: true });
  }
}

function firstDifference(a, b, path = "") {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
    return `${path || "(root)"}: ${JSON.stringify(a)?.slice(0, 160)}  ->  ${JSON.stringify(b)?.slice(0, 160)}`;
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const key of keys) {
    const diff = firstDifference(a[key], b[key], `${path}${Array.isArray(a) ? `[${key}]` : `.${key}`}`);
    if (diff) return diff;
  }
  return null;
}

function compare(beforeFile, afterFile) {
  const before = JSON.parse(readFileSync(beforeFile, "utf8"));
  const after = JSON.parse(readFileSync(afterFile, "utf8"));
  const names = [...new Set([...Object.keys(before.results), ...Object.keys(after.results)])];
  let differences = 0;
  for (const name of names) {
    const diff = firstDifference(before.results[name], after.results[name]);
    if (diff) {
      differences += 1;
      console.log(`DIFF  ${name}\n      ${diff}`);
    }
  }
  console.log(`\n${names.length - differences}/${names.length} endpoints identical`);
  process.exitCode = differences ? 1 : 0;
}

const opts = args(process.argv.slice(2));
const [command, ...rest] = opts._;
if (command === "record") await record(opts);
else if (command === "compare" && rest.length === 2) compare(rest[0], rest[1]);
else {
  console.error("usage: campaign-baseline.mjs record --code <dir> --source <reports db> [--registration-source <registrations db>] --out <json> | compare <before.json> <after.json>");
  process.exitCode = 2;
}
