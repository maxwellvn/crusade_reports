import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { requirePageAccess } from "../auth.js";
import { ApiError, wrap } from "../logger.js";
import { zoneExpenseLookupSchema, zoneExpenseReportSchema } from "../validation.js";
import { loadZones } from "./zones.js";
import { sendExport } from "./exporter.js";

export const crusadeExpenses = Router();
const PAGE_KEY = "dashboard/crusade-expenses";

const normalizeHandle = (value) => String(value || "").trim().replace(/^@/, "").toLowerCase();
const round2 = (value) => Math.round(Number(value) * 100) / 100;

// ponytail: in-memory per-IP limiter for the public lookup; move to a shared
// store if the app ever runs more than one process.
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

const itemsFor = (reportId) => db.prepare(
  "SELECT id, category, amount_espees, note FROM zone_expense_items WHERE report_id = ? ORDER BY position, id"
).all(reportId);

function publicReport(row) {
  const { kingschat_username, ...rest } = row;
  return { ...rest, kingschat_username: `@${kingschat_username}`, items: itemsFor(row.id) };
}

function findByZone(zoneName) {
  return db.prepare("SELECT * FROM zone_expense_reports WHERE zone_name = ? COLLATE NOCASE").get(zoneName.trim());
}

function parseReport(body) {
  const parsed = zoneExpenseReportSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION", parsed.error.issues[0]?.message || "Check the expense report details.");
  return parsed.data;
}

async function regionFor(zoneName) {
  const directory = await loadZones().catch(() => []);
  return directory.find((entry) => String(entry.zone).trim().toLowerCase() === zoneName.trim().toLowerCase())?.region || null;
}

const saveItems = db.transaction((reportId, items) => {
  db.prepare("DELETE FROM zone_expense_items WHERE report_id = ?").run(reportId);
  const insert = db.prepare("INSERT INTO zone_expense_items (report_id, position, category, amount_espees, note) VALUES (?, ?, ?, ?, ?)");
  items.forEach((item, index) => insert.run(reportId, index, item.category, round2(item.amount_espees), item.note || null));
  const total = round2(items.reduce((sum, item) => sum + Number(item.amount_espees), 0));
  db.prepare("UPDATE zone_expense_reports SET total_espees = ?, updated_at = datetime('now') WHERE id = ?").run(total, reportId);
  return total;
});

const reportFields = (data, region) => ({
  zone_name: data.zone_name,
  region,
  designation: data.designation,
  first_name: data.first_name,
  last_name: data.last_name,
  email: data.email,
  phone_country_code: data.phone_country_code,
  phone_number: data.phone_number,
  kingschat_username: normalizeHandle(data.kingschat_username),
  crusade_count: data.crusade_count,
  period_from: data.period_from,
  period_to: data.period_to,
  notes: data.notes || null,
});

// Public: open an existing report with the zone + KingsChat handle it was submitted with.
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

crusadeExpenses.post("/", wrap(async (req, res) => {
  const data = parseReport(req.body);
  if (findByZone(data.zone_name)) {
    throw new ApiError(409, "ZONE_ALREADY_REPORTED", "This zone already has an expense report. Open it with the zone and KingsChat username used to submit it.");
  }
  const reference = `ZXP-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const fields = reportFields(data, await regionFor(data.zone_name));
  const columns = Object.keys(fields);
  const result = db.prepare(
    `INSERT INTO zone_expense_reports (reference_code, ${columns.join(", ")}) VALUES (@reference_code, ${columns.map((c) => `@${c}`).join(", ")})`
  ).run({ reference_code: reference, ...fields });
  saveItems(result.lastInsertRowid, data.items);
  res.status(201).json(publicReport(db.prepare("SELECT * FROM zone_expense_reports WHERE id = ?").get(result.lastInsertRowid)));
}));

// Public update: the body must carry the same zone + KingsChat handle as the stored report.
crusadeExpenses.put("/:id", wrap(async (req, res) => {
  throttleLookup(req.ip);
  const data = parseReport(req.body);
  const row = db.prepare("SELECT * FROM zone_expense_reports WHERE id = ?").get(req.params.id);
  if (!row || row.zone_name.toLowerCase() !== data.zone_name.trim().toLowerCase() || row.kingschat_username !== normalizeHandle(data.kingschat_username)) {
    throw new ApiError(403, "REPORT_MISMATCH", "This report can only be updated with the zone and KingsChat username it was submitted with.");
  }
  const fields = reportFields(data, row.region || await regionFor(data.zone_name));
  db.prepare(`UPDATE zone_expense_reports SET ${Object.keys(fields).map((c) => `${c} = @${c}`).join(", ")} WHERE id = @id`).run({ ...fields, id: row.id });
  saveItems(row.id, data.items);
  res.json(publicReport(db.prepare("SELECT * FROM zone_expense_reports WHERE id = ?").get(row.id)));
}));

export function expenseReportRows(query = {}) {
  const where = []; const params = {};
  const q = String(query.q || "").trim().slice(0, 100);
  if (q) { where.push("(first_name || ' ' || last_name LIKE @q OR email LIKE @q OR kingschat_username LIKE @q OR zone_name LIKE @q OR reference_code LIKE @q)"); params.q = `%${q}%`; }
  for (const [key, column] of [["zone", "zone_name"], ["region", "region"]]) {
    const value = String(query[key] || "").trim().slice(0, 250); if (value) { where.push(`${column} = @${key} COLLATE NOCASE`); params[key] = value; }
  }
  const direction = String(query.direction).toLowerCase() === "asc" ? "ASC" : "DESC";
  const sort = { updated_at: "updated_at", total: "total_espees", zone: "zone_name COLLATE NOCASE", crusades: "crusade_count" }[query.sort] || "updated_at";
  return db.prepare(`SELECT * FROM zone_expense_reports ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${sort} ${direction}, id DESC`).all(params);
}

crusadeExpenses.get("/admin", requirePageAccess(PAGE_KEY), wrap((req, res) => {
  const rows = expenseReportRows(req.query).map((row) => ({ ...row, items: itemsFor(row.id) }));
  const summary = db.prepare(`
    SELECT COUNT(*) AS reports, COALESCE(SUM(total_espees), 0) AS total_espees, COALESCE(SUM(crusade_count), 0) AS crusades
    FROM zone_expense_reports
  `).get();
  const byCategory = db.prepare(`
    SELECT category, COALESCE(SUM(amount_espees), 0) AS total_espees, COUNT(*) AS lines
    FROM zone_expense_items GROUP BY category ORDER BY total_espees DESC
  `).all();
  res.json({
    rows,
    total: summary.reports,
    filtered_total: rows.length,
    summary: { ...summary, total_espees: round2(summary.total_espees), by_category: byCategory.map((r) => ({ ...r, total_espees: round2(r.total_espees) })) },
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
  { header: "Email", value: (r) => r.email },
  { header: "Phone", value: (r) => `${r.phone_country_code} ${r.phone_number}` },
  { header: "KingsChat", value: (r) => `@${r.kingschat_username}` },
  { header: "Crusades covered", value: (r) => r.crusade_count },
  { header: "Period from", value: (r) => r.period_from },
  { header: "Period to", value: (r) => r.period_to },
  { header: "Category", value: (r) => r.category },
  { header: "Amount (Espees)", value: (r) => r.amount_espees },
  { header: "Line note", value: (r) => r.note },
  { header: "Report total (Espees)", value: (r) => r.total_espees },
  { header: "Espees per crusade", value: (r) => round2(r.total_espees / r.crusade_count) },
  { header: "Report notes", value: (r) => r.notes },
  { header: "Last updated (UTC)", value: (r) => r.updated_at },
];
crusadeExpenses.get("/admin/export", requirePageAccess(PAGE_KEY), wrap(async (req, res) => {
  // One row per expense line so the sheet can be pivoted by category or zone.
  const rows = expenseReportRows(req.query).flatMap((report) => itemsFor(report.id).map((item) => ({ ...report, ...item, id: report.id })));
  await sendExport(res, req.query.format === "csv" ? "csv" : "xlsx", "zonal-crusade-expenses", lineColumns, rows);
}));

crusadeExpenses.delete("/admin/:id", requirePageAccess(PAGE_KEY), wrap((req, res) => {
  const result = db.prepare("DELETE FROM zone_expense_reports WHERE id = ?").run(req.params.id);
  if (!result.changes) throw new ApiError(404, "NOT_FOUND", "Expense report not found.");
  res.status(204).end();
}));
