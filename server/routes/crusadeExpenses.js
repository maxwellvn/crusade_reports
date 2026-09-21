import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { requirePageAccess } from "../auth.js";
import { ApiError, wrap } from "../logger.js";
import { zoneExpenseLookupSchema, zoneExpenseReportSchema } from "../validation.js";
import { loadZones } from "./zones.js";
import { sendExport } from "./exporter.js";
import { deleteEvidenceByNames, deleteEvidenceFiles, evidenceFor, evidenceUpload, removeUploadedFiles, resolveEvidencePath, saveEvidence, verifyUploadedEvidence } from "../expenseEvidence.js";

export const crusadeExpenses = Router();
const PAGE_KEY = "dashboard/crusade-expenses";

const normalizeHandle = (value) => String(value || "").trim().replace(/^@/, "").toLowerCase();
const round2 = (value) => Math.round(Number(value) * 100) / 100;

// ponytail: in-memory per-IP limiter for the public lookup/update; move to a
// shared store if the app ever runs more than one process.
const LOOKUP_LIMIT = 20;
const LOOKUP_WINDOW_MS = 10 * 60 * 1000;
const lookupHits = new Map();
function throttleLookup(ip) {
  const now = Date.now();
  const hits = (lookupHits.get(ip) || []).filter((at) => now - at < LOOKUP_WINDOW_MS);
  if (hits.length >= LOOKUP_LIMIT) throw new ApiError(429, "TOO_MANY_LOOKUPS", "Too many attempts. Try again in a few minutes.");
  hits.push(now);
  lookupHits.set(ip, hits);
}

const localTotal = (crusade, part) => round2(part === "sponsored"
  ? Number(crusade.pastor_flight || 0) + Number(crusade.accompanying_flight || 0) + Number(crusade.sponsorship_given || 0) + Number(crusade.other_cost_amount || 0)
  : Number(crusade.venue_cost || 0) + Number(crusade.transport_cost || 0));

function crusadesFor(reportId) {
  const rows = db.prepare("SELECT * FROM zone_expense_crusades WHERE report_id = ? ORDER BY part, position, id").all(reportId)
    .map((row) => ({ ...row, evidence: evidenceFor(row.id) }));
  return { sponsored: rows.filter((r) => r.part === "sponsored"), own: rows.filter((r) => r.part === "own") };
}

const publicReport = (row) => ({ ...row, kingschat_username: `@${row.kingschat_username}`, ...crusadesFor(row.id) });

const findByZone = (zoneName) => db.prepare("SELECT * FROM zone_expense_reports WHERE zone_name = ? COLLATE NOCASE").get(String(zoneName || "").trim());

async function regionFor(zoneName) {
  const directory = await loadZones().catch(() => []);
  return directory.find((entry) => String(entry.zone).trim().toLowerCase() === zoneName.trim().toLowerCase())?.region || null;
}

// The form posts multipart so evidence rides along: JSON in `payload`, files
// named evidence_<part>_<index>.
function parseSubmission(req) {
  let body = req.body;
  if (typeof body?.payload === "string") {
    try { body = JSON.parse(body.payload); }
    catch { removeUploadedFiles(req.files); throw new ApiError(400, "VALIDATION", "Could not read the submitted report."); }
  }
  const parsed = zoneExpenseReportSchema.safeParse(body);
  if (!parsed.success) {
    removeUploadedFiles(req.files);
    throw new ApiError(400, "VALIDATION", parsed.error.issues[0]?.message || "Check the expense report details.");
  }
  return parsed.data;
}

const filesByField = (files = []) => files.reduce((map, file) => {
  (map[file.fieldname] ||= []).push(file);
  return map;
}, {});

const insertCrusade = db.prepare(`
  INSERT INTO zone_expense_crusades (report_id, part, position, crusade_name, nation, city, event_date, attendance, currency_code,
    pastor_flight, accompanying_count, accompanying_flight, sponsorship_given, other_cost_note, other_cost_amount,
    venue_cost, transport_cost, local_total, espees_equivalent, espees_already_given, note)
  VALUES (@report_id, @part, @position, @crusade_name, @nation, @city, @event_date, @attendance, @currency_code,
    @pastor_flight, @accompanying_count, @accompanying_flight, @sponsorship_given, @other_cost_note, @other_cost_amount,
    @venue_cost, @transport_cost, @local_total, @espees_equivalent, @espees_already_given, @note)
`);

// Replaces every crusade line and re-attaches evidence. `keep` lists evidence
// ids the pastor did not remove while editing.
const saveCrusades = db.transaction((reportId, data, uploads, keep) => {
  const previous = db.prepare("SELECT id FROM zone_expense_crusades WHERE report_id = ?").all(reportId).map((r) => r.id);
  const retained = previous.length
    ? db.prepare(`SELECT * FROM zone_expense_evidence WHERE crusade_id IN (${previous.map(() => "?").join(",")})`).all(...previous).filter((row) => keep.has(row.id))
    : [];
  const orphaned = previous.length
    ? db.prepare(`SELECT stored_name FROM zone_expense_evidence WHERE crusade_id IN (${previous.map(() => "?").join(",")})`).all(...previous).filter((row) => !retained.some((k) => k.stored_name === row.stored_name))
    : [];
  db.prepare("DELETE FROM zone_expense_crusades WHERE report_id = ?").run(reportId);

  let sponsoredEspees = 0; let ownEspees = 0; let alreadyGiven = 0;
  for (const part of ["sponsored", "own"]) {
    data[part].forEach((crusade, index) => {
      const row = insertCrusade.run({
        report_id: reportId, part, position: index,
        crusade_name: crusade.crusade_name, nation: crusade.nation, city: crusade.city || null,
        event_date: crusade.event_date, attendance: crusade.attendance ?? 0, currency_code: crusade.currency_code,
        pastor_flight: round2(crusade.pastor_flight || 0), accompanying_count: crusade.accompanying_count || 0,
        accompanying_flight: round2(crusade.accompanying_flight || 0), sponsorship_given: round2(crusade.sponsorship_given || 0),
        other_cost_note: crusade.other_cost_note || null, other_cost_amount: round2(crusade.other_cost_amount || 0),
        venue_cost: round2(crusade.venue_cost || 0), transport_cost: round2(crusade.transport_cost || 0),
        local_total: localTotal(crusade, part), espees_equivalent: round2(crusade.espees_equivalent),
        espees_already_given: round2(crusade.espees_already_given || 0), note: crusade.note || null,
      });
      const crusadeId = row.lastInsertRowid;
      if (part === "sponsored") { sponsoredEspees += crusade.espees_equivalent; alreadyGiven += Number(crusade.espees_already_given || 0); }
      else ownEspees += crusade.espees_equivalent;
      saveEvidence(crusadeId, uploads[`evidence_${part}_${index}`] || []);
      for (const row of retained.filter((r) => (crusade.keep_evidence || []).includes(r.id))) {
        db.prepare("INSERT INTO zone_expense_evidence (crusade_id, stored_name, original_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)")
          .run(crusadeId, row.stored_name, row.original_name, row.mime_type, row.size_bytes);
      }
    });
  }
  db.prepare(`UPDATE zone_expense_reports SET sponsored_espees = ?, own_espees = ?, total_espees = ?, espees_already_given = ?, crusade_count = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(round2(sponsoredEspees), round2(ownEspees), round2(sponsoredEspees + ownEspees), round2(alreadyGiven), data.sponsored.length + data.own.length, reportId);
  return orphaned;
});

const reportFields = (data, region) => ({
  zone_name: data.zone_name, region, designation: data.designation,
  first_name: data.first_name, last_name: data.last_name,
  kingschat_username: normalizeHandle(data.kingschat_username), notes: data.notes || null,
});

const keptIds = (data) => new Set([...data.sponsored, ...data.own].flatMap((c) => c.keep_evidence || []));

crusadeExpenses.post("/lookup", wrap((req, res) => {
  throttleLookup(req.ip);
  const parsed = zoneExpenseLookupSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION", parsed.error.issues[0]?.message || "Check the lookup details.");
  const row = findByZone(parsed.data.zone_name);
  if (!row || row.kingschat_username !== normalizeHandle(parsed.data.kingschat_username)) {
    throw new ApiError(404, "REPORT_NOT_FOUND", "No expense report matches that zone and KingsChat username.");
  }
  res.json(publicReport(row));
}));

crusadeExpenses.post("/", evidenceUpload, wrap(async (req, res) => {
  const data = parseSubmission(req);
  if (findByZone(data.zone_name)) {
    removeUploadedFiles(req.files);
    throw new ApiError(409, "ZONE_ALREADY_REPORTED", "This zone already has an expense report. Open it with the zone and KingsChat username used to submit it.");
  }
  verifyUploadedEvidence(req.files || []);
  const reference = `ZXP-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const fields = reportFields(data, await regionFor(data.zone_name));
  const columns = Object.keys(fields);
  // Uploaded files are already on disk; drop them if the write fails.
  try {
    const result = db.prepare(`INSERT INTO zone_expense_reports (reference_code, ${columns.join(", ")}) VALUES (@reference_code, ${columns.map((c) => `@${c}`).join(", ")})`)
      .run({ reference_code: reference, ...fields });
    saveCrusades(result.lastInsertRowid, data, filesByField(req.files), new Set());
    res.status(201).json(publicReport(db.prepare("SELECT * FROM zone_expense_reports WHERE id = ?").get(result.lastInsertRowid)));
  } catch (error) {
    removeUploadedFiles(req.files);
    throw error;
  }
}));

crusadeExpenses.put("/:id", evidenceUpload, wrap(async (req, res) => {
  throttleLookup(req.ip);
  const data = parseSubmission(req);
  const row = db.prepare("SELECT * FROM zone_expense_reports WHERE id = ?").get(req.params.id);
  if (!row || row.zone_name.toLowerCase() !== data.zone_name.trim().toLowerCase() || row.kingschat_username !== normalizeHandle(data.kingschat_username)) {
    removeUploadedFiles(req.files);
    throw new ApiError(403, "REPORT_MISMATCH", "This report can only be updated with the zone and KingsChat username it was submitted with.");
  }
  verifyUploadedEvidence(req.files || []);
  const fields = reportFields(data, row.region || await regionFor(data.zone_name));
  try {
    db.prepare(`UPDATE zone_expense_reports SET ${Object.keys(fields).map((c) => `${c} = @${c}`).join(", ")} WHERE id = @id`).run({ ...fields, id: row.id });
    const orphaned = saveCrusades(row.id, data, filesByField(req.files), keptIds(data));
    deleteEvidenceByNames(orphaned.map((file) => file.stored_name));
    res.json(publicReport(db.prepare("SELECT * FROM zone_expense_reports WHERE id = ?").get(row.id)));
  } catch (error) {
    removeUploadedFiles(req.files);
    throw error;
  }
}));

crusadeExpenses.get("/evidence/:storedName", requirePageAccess(PAGE_KEY), wrap((req, res) => {
  res.sendFile(resolveEvidencePath(req.params.storedName));
}));

export function expenseReportRows(query = {}) {
  const where = []; const params = {};
  const q = String(query.q || "").trim().slice(0, 100);
  if (q) { where.push("(first_name || ' ' || last_name LIKE @q OR kingschat_username LIKE @q OR zone_name LIKE @q OR reference_code LIKE @q)"); params.q = `%${q}%`; }
  for (const [key, column] of [["zone", "zone_name"], ["region", "region"]]) {
    const value = String(query[key] || "").trim().slice(0, 250); if (value) { where.push(`${column} = @${key} COLLATE NOCASE`); params[key] = value; }
  }
  const direction = String(query.direction).toLowerCase() === "asc" ? "ASC" : "DESC";
  const sort = { updated_at: "updated_at", total: "total_espees", zone: "zone_name COLLATE NOCASE", crusades: "crusade_count" }[query.sort] || "updated_at";
  return db.prepare(`SELECT * FROM zone_expense_reports ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${sort} ${direction}, id DESC`).all(params);
}

crusadeExpenses.get("/admin", requirePageAccess(PAGE_KEY), wrap((req, res) => {
  const rows = expenseReportRows(req.query).map((row) => ({ ...row, ...crusadesFor(row.id) }));
  const summary = db.prepare(`
    SELECT COUNT(*) AS reports, COALESCE(SUM(total_espees), 0) AS total_espees, COALESCE(SUM(sponsored_espees), 0) AS sponsored_espees,
           COALESCE(SUM(own_espees), 0) AS own_espees, COALESCE(SUM(espees_already_given), 0) AS espees_already_given,
           COALESCE(SUM(crusade_count), 0) AS crusades
    FROM zone_expense_reports
  `).get();
  const byPart = db.prepare("SELECT part, COUNT(*) AS crusades, COALESCE(SUM(espees_equivalent), 0) AS espees FROM zone_expense_crusades GROUP BY part").all();
  res.json({
    rows,
    total: summary.reports,
    filtered_total: rows.length,
    summary: { ...summary, by_part: byPart.map((r) => ({ ...r, espees: round2(r.espees) })) },
    filter_options: {
      zones: db.prepare("SELECT DISTINCT zone_name AS name FROM zone_expense_reports ORDER BY name COLLATE NOCASE").all().map((r) => r.name),
      regions: db.prepare("SELECT DISTINCT region AS name FROM zone_expense_reports WHERE region IS NOT NULL ORDER BY name COLLATE NOCASE").all().map((r) => r.name),
    },
  });
}));

const lineColumns = [
  { header: "Reference", value: (r) => r.reference_code },
  { header: "Zone", value: (r) => r.zone_name },
  { header: "Region", value: (r) => r.region },
  { header: "Pastor", value: (r) => `${r.designation} ${r.first_name} ${r.last_name}` },
  { header: "KingsChat", value: (r) => `@${r.kingschat_username}` },
  { header: "Part", value: (r) => r.part === "sponsored" ? "A — Invited by Rhapsody" : "B — Zone's own" },
  { header: "Crusade", value: (r) => r.crusade_name },
  { header: "Nation", value: (r) => r.nation },
  { header: "City", value: (r) => r.city },
  { header: "Date held", value: (r) => r.event_date },
  { header: "Attendance", value: (r) => r.part === "own" ? r.attendance : "" },
  { header: "Currency", value: (r) => r.currency_code },
  { header: "Pastor flight", value: (r) => r.pastor_flight },
  { header: "Accompanying persons", value: (r) => r.accompanying_count },
  { header: "Accompanying person's expenses", value: (r) => r.accompanying_flight },
  { header: "Sponsorship given", value: (r) => r.sponsorship_given },
  { header: "Other costs", value: (r) => r.other_cost_amount },
  { header: "Other costs detail", value: (r) => r.other_cost_note },
  { header: "Venue cost", value: (r) => r.venue_cost },
  { header: "Transportation cost", value: (r) => r.transport_cost },
  { header: "Local total", value: (r) => r.local_total },
  { header: "Espees equivalent", value: (r) => r.espees_equivalent },
  { header: "Espees already given", value: (r) => r.espees_already_given },
  { header: "Evidence files", value: (r) => r.evidence.length },
  { header: "Crusade note", value: (r) => r.note },
  { header: "Report notes", value: (r) => r.notes },
  { header: "Last updated (UTC)", value: (r) => r.updated_at },
];
crusadeExpenses.get("/admin/export", requirePageAccess(PAGE_KEY), wrap(async (req, res) => {
  // One row per crusade so the sheet pivots by part, nation or zone.
  const rows = expenseReportRows(req.query).flatMap((report) => {
    const { sponsored, own } = crusadesFor(report.id);
    return [...sponsored, ...own].map((crusade) => ({ ...report, ...crusade }));
  });
  await sendExport(res, req.query.format === "csv" ? "csv" : "xlsx", "zonal-crusade-expenses", lineColumns, rows);
}));

crusadeExpenses.delete("/admin/:id", requirePageAccess(PAGE_KEY), wrap((req, res) => {
  const crusadeIds = db.prepare("SELECT id FROM zone_expense_crusades WHERE report_id = ?").all(req.params.id).map((r) => r.id);
  const result = db.prepare("DELETE FROM zone_expense_reports WHERE id = ?").run(req.params.id);
  if (!result.changes) throw new ApiError(404, "NOT_FOUND", "Expense report not found.");
  deleteEvidenceFiles(crusadeIds);
  res.status(204).end();
}));
