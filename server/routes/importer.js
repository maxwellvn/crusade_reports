import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { logger, wrap, ApiError } from "../logger.js";
import { loadWorkbook } from "../xlsxSanitize.js";
import { resolveCity } from "../cityResolve.js";
import { loadZones } from "./zones.js";
import { resolveCountryName } from "./countries.js";
import { db } from "../db.js";
import { reportSchema } from "../validation.js";
// Reuse the client's single source of truth so the template columns, the dropdown
// options and the validator can never drift apart. constants.js is pure data.
import { CRUSADE_TYPES, CORE_OUTCOMES, EXTENDED_OUTCOMES } from "../../client/src/lib/constants.js";

export const importer = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ponytail: multer 1.x lts has advisories but is the standard; buffer-only, 5MB cap
// bounds the exposure. Swap to busboy if it ever matters.

// The report identity (who + where) is chosen ONCE in the web form with searchable
// pickers — NOT in the spreadsheet. The sheet only carries the bulk crusade rows.
// `req: true` marks a required column (shown with * in the header, enforced on upload).
const METRIC_COLS = [...CORE_OUTCOMES, ...EXTENDED_OUTCOMES].map(([k, label]) => ({
  h: label, k, type: "int", d: `${label} at this crusade. A whole number. Leave blank if none (counts as 0).`,
}));
const CRUSADE_COLS = [
  { h: "Crusade Type", k: "event_type", type: "crusadeType", req: true, d: "Pick from the dropdown. The kind of crusade held (e.g. Street, Mega, Prison, Online)." },
  { h: "Other Type", k: "other_event_type", d: "Only fill this if Crusade Type is 'Other' — then describe the type here." },
  { h: "Format", k: "format", d: "Physical or Online. Leave blank for Physical." },
  { h: "Country", k: "country", req: true, d: "The country where this crusade held. Type the country name (e.g. Nigeria, Ghana, South Africa)." },
  { h: "City", k: "city", req: true, d: "The city where this crusade happened. We match it to Google Places on upload; if it's not found we keep what you typed." },
  { h: "Date (YYYY-MM-DD)", k: "event_date", type: "date", req: true, d: "The date the crusade held. Format: YYYY-MM-DD, e.g. 2026-06-01." },
  { h: "Onsite Attendance", k: "attendance", type: "int", req: true, d: "How many people were physically present at this one crusade. Put 0 for online crusades." },
  { h: "Online Attendance", k: "online_participation", type: "int", d: "How many joined online (stream/virtual). Leave blank if none (counts as 0)." },
  { h: "Minister", k: "minister_name", req: true, d: "Name of the minister who ministered at this crusade." },
  { h: "Venue", k: "venue", req: true, d: "Where it held (e.g. City Stadium, Main Market). For online/TV/radio, put 'Online' or 'N/A'." },
  { h: "Event Name", k: "event_name", req: true, d: "A short name/label for this crusade (e.g. 'Aba Street Reach June')." },
  ...METRIC_COLS,
];
const ALL_COLS = CRUSADE_COLS;

const TYPE_LABELS = CRUSADE_TYPES.map(([, l]) => l);
const LABEL_TO_CODE = new Map(CRUSADE_TYPES.map(([v, l]) => [l.toLowerCase(), v]));
const CODES = new Set(CRUSADE_TYPES.map(([v]) => v));
const header = (c) => c.h + (c.req ? " *" : "");
const normHeader = (s) => String(s || "").replace(/\s*\*\s*$/, "").trim().toLowerCase();

// ---- GET /api/import/template : generate the .xlsx --------------------------
importer.get("/template", wrap(async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Crusades");
  const lists = wb.addWorksheet("Lists");
  lists.state = "veryHidden";

  ws.columns = ALL_COLS.map((c) => ({ header: header(c), key: c.k, width: Math.max(14, header(c).length + 2) }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).eachCell((cell, col) => {
    const c = ALL_COLS[col - 1];
    if (c?.req) cell.font = { bold: true, color: { argb: "FFC00000" } }; // required = red header
    if (c?.d) cell.note = `${c.d}${c.req ? "\n\n(Required)" : "\n\n(Optional)"}`; // hover description on each header
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Dropdown backing lists (the report identity is set in the app).
  TYPE_LABELS.forEach((v, i) => (lists.getCell(`B${i + 1}`).value = v));
  ["Physical", "Online"].forEach((v, i) => (lists.getCell(`C${i + 1}`).value = v));
  const typeCol = ws.getColumn("event_type").letter;
  const formatCol = ws.getColumn("format").letter;
  for (let r = 2; r <= 1000; r++) {
    ws.getCell(`${typeCol}${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: [`Lists!$B$1:$B$${TYPE_LABELS.length}`],
    };
    ws.getCell(`${formatCol}${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: ["Lists!$C$1:$C$2"],
    };
  }

  // NB: the 'Crusades' sheet ships with headers only — NO sample data row, so the
  // example can never be imported by accident. The example lives in Instructions.
  const info = wb.addWorksheet("Instructions");
  [
    ["Crusade Reports — import template"],
    [""],
    ["1. First, in the app: choose WHO is reporting (Zone / Group / Church / Network)."],
    ["   You do that with the searchable pickers — it applies to every crusade in this file."],
    ["2. Here in the 'Crusades' sheet: ONE ROW PER CRUSADE. Each row has its own Country."],
    ["3. Columns marked * (red header) are REQUIRED: Crusade Type, Country, City, Date, Onsite Attendance, Minister, Venue, Event Name."],
    ["   Format: Physical or Online (blank = Physical). Online crusades: put 0 for Onsite Attendance and the viewers in Online Attendance."],
    ["4. 'Crusade Type' has a dropdown — pick from the list (don't hand-type)."],
    ["5. ONE ROW = ONE CRUSADE. Ran 5 street crusades? That's 5 rows (copy the row and change the details)."],
    ["6. Country + City = where this crusade held (we match the city to Google Places on upload). Date format: YYYY-MM-DD. Outcome numbers are optional (blank = 0)."],
    ["7. For online / TV / radio crusades, put something like 'Online' or 'N/A' for Venue."],
    ["8. Save and upload in the app. You'll see a preview and exact row/column errors before anything is saved."],
    [""],
    ["EXAMPLE (values like these in the Crusades sheet):"],
    ["Crusade Type", "Format", "Country", "City", "Date (YYYY-MM-DD)", "Onsite Attendance", "Online Attendance", "Minister", "Venue", "Event Name", "Salvations"],
    ["Street Crusades", "Physical", "Nigeria", "Aba", "2026-06-01", 300, 0, "Pastor John", "Main Market Sq.", "Aba Street Reach", 100],
  ].forEach((row) => info.addRow(row));
  info.getRow(1).font = { bold: true, size: 14 };

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="crusade-report-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}));

// ---- POST /api/import?commit=1 : parse, validate, preview or save -----------
importer.post("/", upload.single("file"), wrap(async (req, res) => {
  if (!req.file) throw new ApiError(400, "NO_FILE", "No spreadsheet uploaded");

  const wb = new ExcelJS.Workbook();
  try {
    // Retry without comment parts if exceljs can't reconcile the file (see xlsxSanitize.js).
    await loadWorkbook(wb, req.file.buffer);
  } catch {
    throw new ApiError(422, "BAD_FILE", "Could not read that file — use the .xlsx template");
  }
  const ws = wb.getWorksheet("Crusades");
  if (!ws) throw new ApiError(422, "NO_SHEET", "The file has no 'Crusades' sheet — use the template");

  // Map header text -> column index (tolerant of reordering + the " *" required marks).
  const colByKey = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = normHeader(cell.value);
    // "attendance" / "online participation" accept pre-rename templates.
    const found = ALL_COLS.find((c) => normHeader(c.h) === h)
      || (h === "attendance" && { k: "attendance" })
      || (h === "online participation" && { k: "online_participation" });
    if (found) colByKey[found.k] = col;
  });
  // Surface missing REQUIRED columns up front (a common "wrong file" mistake).
  const missingCols = CRUSADE_COLS.filter((c) => c.req && !colByKey[c.k]).map((c) => c.h);
  if (missingCols.length) {
    throw new ApiError(422, "MISSING_COLUMNS", `The sheet is missing required column(s): ${missingCols.join(", ")}. Use the downloaded template.`);
  }

  // Report identity comes from the app (multipart text fields), not the sheet.
  const report = {
    organization_type: String(req.body.organization_type || "").trim().toLowerCase(),
    zone: String(req.body.zone || "").trim(),
    group_name: String(req.body.group_name || "").trim(),
    church_name: String(req.body.church_name || "").trim(),
    network_name: String(req.body.network_name || "").trim(),
    country: String(req.body.country || "").trim(),
    contact_name: String(req.body.contact_name || "").trim(),
    contact_email: String(req.body.contact_email || "").trim(),
    phone_country_code: String(req.body.phone_country_code || "").trim(),
    phone_number: String(req.body.phone_number || "").trim(),
    kingschat_username: String(req.body.kingschat_username || "").trim(),
  };

  // ---- Parse rows with precise, per-row/per-field errors ----
  const rowErrors = [];
  const crusades = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k) => (colByKey[k] ? cellValue(row.getCell(colByKey[k])) : "");
    const raw = (k) => String(get(k) ?? "").trim();
    if (CRUSADE_COLS.every((c) => raw(c.k) === "")) continue; // fully blank row

    for (const c of CRUSADE_COLS.filter((c) => c.req)) {
      if (raw(c.k) === "") rowErrors.push(`Row ${r}: "${c.h}" is required but empty.`);
    }

    const rawType = raw("event_type");
    const code = CODES.has(rawType) ? rawType : LABEL_TO_CODE.get(rawType.toLowerCase());
    if (rawType && !code) rowErrors.push(`Row ${r}: Crusade Type "${rawType}" is not in the list — pick from the dropdown.`);
    if (code === "other" && !raw("other_event_type")) rowErrors.push(`Row ${r}: "Other Type" is required when Crusade Type is Other.`);

    const rawFormat = raw("format").toLowerCase();
    if (rawFormat && !["physical", "online"].includes(rawFormat)) rowErrors.push(`Row ${r}: Format "${raw("format")}" must be Physical or Online.`);

    const date = normalizeDate(get("event_date"));
    if (raw("event_date") && !/^\d{4}-\d{2}-\d{2}$/.test(date)) rowErrors.push(`Row ${r}: Date "${raw("event_date")}" must be formatted YYYY-MM-DD.`);
    if (raw("attendance") && !/^-?\d[\d, ]*$/.test(raw("attendance"))) rowErrors.push(`Row ${r}: Onsite Attendance "${raw("attendance")}" must be a number.`);
    if (raw("online_participation") && !/^-?\d[\d, ]*$/.test(raw("online_participation"))) rowErrors.push(`Row ${r}: Online Attendance "${raw("online_participation")}" must be a number.`);
    for (const m of METRIC_COLS) {
      if (raw(m.k) && !/^-?\d[\d, ]*$/.test(raw(m.k))) rowErrors.push(`Row ${r}: ${m.h} "${raw(m.k)}" must be a number.`);
    }

    const rawCountry = raw("country");
    const country = resolveCountryName(rawCountry);
    if (rawCountry && !country) {
      rowErrors.push(`Row ${r}: Country "${rawCountry}" is not recognized. Use a country from the template list.`);
    }

    const c = {
      event_type: code || rawType, other_event_type: raw("other_event_type"), event_name: raw("event_name"),
      format: rawFormat === "online" ? "online" : "physical",
      country: country || rawCountry, city: raw("city"), city_place_id: "", event_date: date, attendance: toInt(get("attendance"), 0),
      online_participation: toInt(get("online_participation"), 0),
      minister_name: raw("minister_name"), venue: raw("venue"),
    };
    for (const m of METRIC_COLS) c[m.k] = toInt(get(m.k), 0);
    crusades.push(c);
  }

  if (!crusades.length) throw new ApiError(422, "EMPTY", "No crusade rows found — fill at least one row under the headers.");

  // ---- Canonicalize the report identity against the live lists ----
  const t = report.organization_type;
  const zdata = await loadZones().catch(() => []);
  const canonZone = report.zone ? zdata.find((z) => z.zone.toLowerCase() === report.zone.toLowerCase()) : null;
  if (["zone", "group", "church"].includes(t) && report.zone) {
    if (!canonZone) rowErrors.push(`Zone "${report.zone}" is not recognized — reselect it in the form.`);
    else report.zone = canonZone.zone;
  }
  if (["group", "church"].includes(t) && report.group_name && canonZone) {
    const g = canonZone.groups.find((x) => x.name.toLowerCase() === report.group_name.toLowerCase());
    if (!g) rowErrors.push(`Group "${report.group_name}" is not in zone "${canonZone.zone}" — reselect it in the form.`);
    else report.group_name = g.name;
  }
  if (t === "network" && report.network_name) {
    const net = db.prepare("SELECT name FROM networks WHERE name = ? COLLATE NOCASE").get(report.network_name);
    if (!net) rowErrors.push(`Network "${report.network_name}" is not recognized — reselect it in the form.`);
    else { report.network_name = net.name; report.network_type = "predefined"; }
  }

  const summary = {
    crusades: crusades.length,
    onsite_attendance: crusades.reduce((s, c) => s + c.attendance, 0),
    online_attendance: crusades.reduce((s, c) => s + c.online_participation, 0),
    total_attendance: crusades.reduce((s, c) => s + c.attendance + c.online_participation, 0),
    reporting_as: report.organization_type,
    countries: [...new Set(crusades.map((c) => resolveCountryName(c.country) || c.country).filter(Boolean))],
  };

  if (rowErrors.length) {
    logger.warn({ errors: rowErrors.length, sample: rowErrors.slice(0, 5) }, "import rejected");
    return res.status(200).json({ ok: false, errors: rowErrors.slice(0, 100), summary });
  }

  // Data is clean → relate each city to Google Places (canonical name + place_id);
  // if Places doesn't find it (or is down), keep the typed city and warn the reporter.
  // Country is per-crusade now, so each city is geocoded against its own country.
  const cityCache = new Map();
  const warnings = [];
  for (const c of crusades) {
    if (!c.city) continue;
    const resolved = await resolveCity(c.city, c.country, cityCache, warnings, "import");
    c.city = resolved.name;
    c.city_place_id = resolved.place_id;
  }

  // Final schema gate (catches anything the field checks didn't, e.g. missing identity).
  const parsed = reportSchema.safeParse({ ...report, crusades });
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      const row = iss.path[0] === "crusades" && typeof iss.path[1] === "number" ? `Row ${iss.path[1] + 2}: ` : "";
      const field = iss.path[iss.path.length - 1];
      rowErrors.push(`${row}${field}: ${iss.message}`);
    }
    logger.warn({ errors: rowErrors }, "import schema rejected");
    return res.status(200).json({ ok: false, errors: rowErrors.slice(0, 100), summary });
  }

  // No server-side commit: the parsed rows go back to the client, which loads
  // them into the form so the reporter reviews and submits like a manual entry.
  logger.info(summary, "import parsed");
  res.status(200).json({ ok: true, errors: [], warnings, summary, crusades: parsed.data.crusades });
}));

function cellValue(cell) {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v;
    if (v.text) return v.text; // rich text / hyperlink
    if (v.result != null) return v.result; // formula
    return "";
  }
  return v;
}

function normalizeDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").trim();
}

function toInt(v, dflt) {
  const n = parseInt(String(v).replace(/[, ]/g, ""), 10);
  return Number.isFinite(n) ? n : dflt;
}
