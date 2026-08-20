import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { logger, wrap, ApiError } from "../logger.js";
import { loadZones } from "./zones.js";
import { db } from "../db.js";
import { registrationSchema } from "../validation.js";
import { validateRegistrationOrganization, insertRegistration } from "./registrations.js";
import { isManualZonesEnabled, isManualGroupsEnabled } from "../appSettings.js";
import { loadWorkbook } from "../xlsxSanitize.js";
import { resolveCity } from "../cityResolve.js";
import { resolveCountryName } from "./countries.js";
// Reuse the client's single source of truth so the template columns, the dropdown
// options and the validator can never drift apart. constants.js is pure data.
import { CRUSADE_TYPES, ZONE_CONTRIBUTIONS, PERMIT_OPTIONS } from "../../client/src/lib/constants.js";

export const registrationImporter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// The registration identity (who is registering) is chosen ONCE in the web form
// with searchable pickers — NOT in the spreadsheet. The sheet only carries the
// bulk crusade rows. `req: true` marks a required column (shown with * in the
// header, enforced on upload).
const CRUSADE_COLS = [
  { h: "Crusade Type", k: "event_type", type: "crusadeType", req: true, d: "Pick from the dropdown. The kind of crusade (e.g. Street, Mega, Prison, Online)." },
  { h: "Event Name", k: "event_name", req: true, d: "A short name/label for this crusade (e.g. 'Lekki Community Crusade'). 2–300 characters." },
  { h: "Event Date (YYYY-MM-DD)", k: "event_date", type: "date", req: true, d: "The date the crusade will hold. Format: YYYY-MM-DD, e.g. 2026-12-05." },
  { h: "Venue", k: "venue", req: true, d: "Where it will hold (e.g. City Stadium, 10 Main Road). Put 'Unsure' if you don't know yet. 2–1000 characters." },
  { h: "Expected Attendance", k: "expected_attendance", type: "int", req: true, d: "How many people you expect at this one crusade. A whole number, 1 or more." },
  { h: "Minister(s)", k: "minister_name", req: true, d: "Name(s) of the minister(s). Separate multiple ministers with commas (e.g. 'Pastor John, Pastor Mary')." },
  { h: "Country", k: "country", req: true, d: "The country where this crusade will hold. Type the country name (e.g. Nigeria, Ghana, South Africa)." },
  { h: "City", k: "city", req: true, d: "The city where this crusade will hold. We match it to Google Places on upload; if it's not found we keep what you typed." },
  // Network-only planning fields. Harmless for other org types — the server only
  // persists them when organization_type === 'network', but the template ships
  // them so a network reporter can fill everything in one pass.
  { h: "Crusade Collaborators", k: "crusade_collaborators", d: "NETWORK ONLY. Zones/networks/ministries partnering on this crusade. Separate multiple with commas." },
  { h: "Zone Contribution", k: "zone_contribution", d: "NETWORK ONLY. How the zone contributes. Pick from the dropdown (multi-select via commas): " + ZONE_CONTRIBUTIONS.join(", ") + "." },
  { h: "Estimated Budget (Espees)", k: "estimated_budget", d: "NETWORK ONLY. Estimated crusade budget in Espees. Numbers only — no letters or currency symbols (e.g. 2,000,000)." },
  { h: "Rhapsody Copies Confirmed", k: "rhapsody_copies_confirmed", d: "NETWORK ONLY. Number of Rhapsody of Realities copies confirmed. Numbers only — no letters (e.g. 5,000)." },
  { h: "Permits Obtained", k: "permits_obtained", d: "NETWORK ONLY. Have the required permits been obtained? Pick from the dropdown: " + PERMIT_OPTIONS.join(", ") + "." },
  { h: "Media Coverage Plan", k: "media_coverage_plan", d: "NETWORK ONLY. Your media coverage plan (TV, radio, social media, press…). Up to 2000 characters." },
];
const ALL_COLS = CRUSADE_COLS;

const TYPE_LABELS = CRUSADE_TYPES.map(([, l]) => l);
const DIRECT_COMMIT_THRESHOLD = 100;
const LABEL_TO_CODE = new Map(CRUSADE_TYPES.map(([v, l]) => [l.toLowerCase(), v]));
const CODES = new Set(CRUSADE_TYPES.map(([v]) => v));
const PERMIT_SET = new Set(PERMIT_OPTIONS.map((o) => o.toLowerCase()));
const CONTRIBUTION_SET = new Set(ZONE_CONTRIBUTIONS.map((c) => c.toLowerCase()));
const header = (c) => c.h + (c.req ? " *" : "");
const normHeader = (s) => String(s || "").replace(/\s*\*\s*$/, "").trim().toLowerCase();

// ---- GET /api/registrations/import/template : generate the .xlsx -------------
registrationImporter.get("/template", wrap(async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Crusades");
  const lists = wb.addWorksheet("Lists");
  lists.state = "veryHidden";

  ws.columns = ALL_COLS.map((c) => ({ header: header(c), key: c.k, width: Math.max(16, header(c).length + 2) }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).eachCell((cell, col) => {
    const c = ALL_COLS[col - 1];
    if (c?.req) cell.font = { bold: true, color: { argb: "FFC00000" } }; // required = red header
    if (c?.d) cell.note = `${c.d}${c.req ? "\n\n(Required)" : "\n\n(Optional — network registrations only)"}`;
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Dropdown backing lists on the hidden Lists sheet.
  TYPE_LABELS.forEach((v, i) => (lists.getCell(`B${i + 1}`).value = v));
  PERMIT_OPTIONS.forEach((v, i) => (lists.getCell(`C${i + 1}`).value = v));
  ZONE_CONTRIBUTIONS.forEach((v, i) => (lists.getCell(`D${i + 1}`).value = v));
  const typeCol = ws.getColumn("event_type").letter;
  const permitsCol = ws.getColumn("permits_obtained").letter;
  const contribCol = ws.getColumn("zone_contribution").letter;
  for (let r = 2; r <= 1000; r++) {
    ws.getCell(`${typeCol}${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: [`Lists!$B$1:$B$${TYPE_LABELS.length}`],
    };
    ws.getCell(`${permitsCol}${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: [`Lists!$C$1:$C$${PERMIT_OPTIONS.length}`],
    };
    ws.getCell(`${contribCol}${r}`).dataValidation = {
      type: "list", allowBlank: true, formulae: [`Lists!$D$1:$D$${ZONE_CONTRIBUTIONS.length}`],
    };
  }

  // NB: the 'Crusades' sheet ships with headers only — NO sample data row, so the
  // example can never be imported by accident. The example lives in Instructions.
  const info = wb.addWorksheet("Instructions");
  [
    ["Crusade Registration — bulk import template"],
    [""],
    ["1. First, in the app: choose WHO is registering (Zone / Group / Church / Cell / Network) and your contact details."],
    ["   You do that with the searchable pickers — it applies to every crusade in this file."],
    ["2. Here in the 'Crusades' sheet: ONE ROW PER CRUSADE. Each row has its own Country and City."],
    ["3. Columns marked * (red header) are REQUIRED: Crusade Type, Event Name, Event Date, Venue, Expected Attendance, Minister(s), Country, City."],
    ["4. 'Crusade Type' has a dropdown — pick from the list (don't hand-type)."],
    ["5. ONE ROW = ONE CRUSADE. Registering 5 street crusades? That's 5 rows (copy the row and change the details)."],
    ["6. Date format: YYYY-MM-DD (e.g. 2026-12-05). Expected Attendance is a whole number, 1 or more."],
    ["7. Minister(s): separate multiple ministers with commas (e.g. 'Pastor John, Pastor Mary')."],
    ["8. The last 6 columns (Collaborators, Zone Contribution, Estimated Budget, Rhapsody Copies, Permits, Media Plan) are NETWORK REGISTRATIONS ONLY."],
    ["   Leave them blank if you are not registering as a network."],
    ["9. NUMBER FIELDS (Expected Attendance, Estimated Budget, Rhapsody Copies Confirmed) accept DIGITS AND COMMAS ONLY."],
    ["   No letters, currency symbols, or text — e.g. enter 2,000,000 not '2 million Espees' or '₦2,000,000'."],
    ["10. Save and upload in the app. You'll see a preview and exact row/column errors before anything is saved."],
    [""],
    ["EXAMPLE (values like these in the Crusades sheet):"],
    ["Crusade Type", "Event Name", "Event Date (YYYY-MM-DD)", "Venue", "Expected Attendance", "Minister(s)", "Country", "City"],
    ["Street Crusades", "Aba Street Reach", "2026-12-05", "Main Market Sq.", 300, "Pastor John", "Nigeria", "Aba"],
  ].forEach((row) => info.addRow(row));
  info.getRow(1).font = { bold: true, size: 14 };

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="crusade-registration-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}));

// ---- POST /api/registrations/import : parse, validate, preview (no commit) ---
registrationImporter.post("/", upload.single("file"), wrap(async (req, res) => {
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

  // Map header text -> column index (tolerant of reordering, the " *" required
  // marks, and parenthetical suffixes like "(Espees)" added in later templates).
  const colByKey = {};
  ws.getRow(1).eachCell((cell, col) => {
    const h = normHeader(cell.value);
    const found = ALL_COLS.find((c) => normHeader(c.h) === h)
      || ALL_COLS.find((c) => normHeader(c.h.replace(/\s*\([^)]*\)\s*$/, "")) === h);
    if (found) colByKey[found.k] = col;
  });
  // Surface missing REQUIRED columns up front (a common "wrong file" mistake).
  const missingCols = CRUSADE_COLS.filter((c) => c.req && !colByKey[c.k]).map((c) => c.h);
  if (missingCols.length) {
    throw new ApiError(422, "MISSING_COLUMNS", `The sheet is missing required column(s): ${missingCols.join(", ")}. Use the downloaded template.`);
  }

  // Registration identity comes from the app (multipart text fields), not the sheet.
  const reg = {
    organization_type: String(req.body.organization_type || "").trim().toLowerCase(),
    zone: String(req.body.zone || "").trim(),
    group_name: String(req.body.group_name || "").trim(),
    church_name: String(req.body.church_name || "").trim(),
    cell_name: String(req.body.cell_name || "").trim(),
    network_name: String(req.body.network_name || "").trim(),
    contact_name: String(req.body.contact_name || "").trim(),
    contact_email: String(req.body.contact_email || "").trim(),
    phone_country_code: String(req.body.phone_country_code || "").trim(),
    phone_number: String(req.body.phone_number || "").trim(),
    kingschat_username: String(req.body.kingschat_username || "").trim(),
  };

  // Bulk upload is open to every organization type.

  // ---- Parse rows with precise, per-row/per-field errors ----
  const rowErrors = [];
  const items = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k) => (colByKey[k] ? cellValue(row.getCell(colByKey[k])) : "");
    const raw = (k) => String(get(k) ?? "").trim();
    if (CRUSADE_COLS.every((c) => raw(c.k) === "")) continue; // fully blank row

    for (const c of CRUSADE_COLS.filter((c) => c.req)) {
      if (raw(c.k) === "") rowErrors.push(`Row ${r}, column "${c.h}": this field is required and cannot be empty.`);
    }

    const rawType = raw("event_type");
    const code = CODES.has(rawType) ? rawType : LABEL_TO_CODE.get(rawType.toLowerCase());
    if (rawType && !code) rowErrors.push(`Row ${r}, column "Crusade Type": "${rawType}" is not a valid crusade type. Pick one from the dropdown: ${TYPE_LABELS.slice(0, 5).join(", ")}, …`);

    const date = normalizeDate(get("event_date"));
    if (raw("event_date") && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      rowErrors.push(`Row ${r}, column "Event Date": "${raw("event_date")}" is not a valid date. Use the format YYYY-MM-DD (e.g. 2026-12-05).`);
    }

    // Number fields: digits and commas only. Letters, currency symbols, and
    // words like "million" are rejected with a precise message naming the
    // column, the offending value, and what is expected.
    if (raw("expected_attendance") && !/^\d[\d, ]*$/.test(raw("expected_attendance"))) {
      rowErrors.push(`Row ${r}, column "Expected Attendance": "${raw("expected_attendance")}" contains non-numeric characters. Enter digits only (commas allowed), e.g. 500.`);
    }
    const attendance = toInt(get("expected_attendance"), 0);
    if (raw("expected_attendance") && attendance < 1) {
      rowErrors.push(`Row ${r}, column "Expected Attendance": must be at least 1 (got ${attendance}).`);
    }

    // Network-only field sanity checks. These are optional for non-network orgs;
    // we still validate format when present so a typo doesn't silently drop.
    if (raw("estimated_budget") && !/^\d[\d, ]*$/.test(raw("estimated_budget"))) {
      rowErrors.push(`Row ${r}, column "Estimated Budget (Espees)": "${raw("estimated_budget")}" contains non-numeric characters. Enter digits only (commas allowed), e.g. 2,000,000. No letters or currency symbols.`);
    }
    if (raw("rhapsody_copies_confirmed") && !/^\d[\d, ]*$/.test(raw("rhapsody_copies_confirmed"))) {
      rowErrors.push(`Row ${r}, column "Rhapsody Copies Confirmed": "${raw("rhapsody_copies_confirmed")}" contains non-numeric characters. Enter digits only (commas allowed), e.g. 5,000. No letters.`);
    }
    if (raw("permits_obtained") && !PERMIT_SET.has(raw("permits_obtained").toLowerCase())) {
      rowErrors.push(`Row ${r}, column "Permits Obtained": "${raw("permits_obtained")}" is not a valid option. Pick one of: ${PERMIT_OPTIONS.join(", ")}.`);
    }
    if (raw("zone_contribution")) {
      const bad = raw("zone_contribution").split(",").map((s) => s.trim().toLowerCase()).filter((s) => s && !CONTRIBUTION_SET.has(s));
      if (bad.length) rowErrors.push(`Row ${r}, column "Zone Contribution": unknown value(s) "${bad.join(", ")}". Pick from: ${ZONE_CONTRIBUTIONS.join(", ")}.`);
    }

    const rawCountry = raw("country");
    const country = resolveCountryName(rawCountry);
    if (rawCountry && !country) {
      rowErrors.push(`Row ${r}, column "Country": "${rawCountry}" is not recognized. Use a country from the template list.`);
    }

    const item = {
      event_type: code || rawType,
      event_name: raw("event_name"),
      event_date: date,
      venue: raw("venue"),
      expected_attendance: attendance,
      minister_name: raw("minister_name"),
      country: country || rawCountry,
      city: raw("city"),
      city_place_id: "",
      // Multi-select fields arrive as comma-joined strings; split into arrays so
      // registrationSchema (which expects arrays) accepts them.
      crusade_collaborators: splitList(raw("crusade_collaborators")),
      zone_contribution: splitList(raw("zone_contribution")),
      estimated_budget: raw("estimated_budget"),
      rhapsody_copies_confirmed: raw("rhapsody_copies_confirmed"),
      permits_obtained: raw("permits_obtained"),
      media_coverage_plan: raw("media_coverage_plan"),
    };
    items.push(item);
  }

  if (!items.length) throw new ApiError(422, "EMPTY", "No crusade rows found — fill at least one row under the headers.");

  // Over the threshold the preview ships no rows and the client must commit
  // directly (see the response block below) — the form would freeze loading
  // tens of thousands of fields. commit=1 skips that gate and inserts to the DB.
  const directCommit = String(req.body.commit || req.query.commit || "") === "1";

  // ---- Canonicalize the registration identity against the live directory ----
  // The server, not the spreadsheet, decides whether a zone/group is canonical.
  // Reuse the same validator the public POST /registrations uses so the rules
  // can never drift. Manual-zone/group flags are honored from campaign settings.
  const directory = reg.organization_type === "network" ? [] : await loadZones().catch(() => []);
  let canonical;
  try {
    canonical = validateRegistrationOrganization(reg, directory, {
      manualZonesEnabled: isManualZonesEnabled(),
      manualGroupsEnabled: isManualGroupsEnabled(),
      trustedZone: false,
    });
  } catch (e) {
    if (e instanceof ApiError) rowErrors.push(e.message);
    else throw e;
  }
  // Network name is not handled by validateRegistrationOrganization (it returns
  // early for networks); canonicalize it against the networks table like the
  // report importer does.
  if (reg.organization_type === "network" && reg.network_name) {
    const net = db.prepare("SELECT name FROM networks WHERE name = ? COLLATE NOCASE").get(reg.network_name);
    if (!net) rowErrors.push(`Network "${reg.network_name}" is not recognized — reselect it in the form.`);
    else reg.network_name = net.name;
  }

  const summary = {
    crusades: items.length,
    expected_attendance: items.reduce((s, c) => s + (Number(c.expected_attendance) || 0), 0),
    registering_as: reg.organization_type,
    countries: [...new Set(items.map((c) => c.country).filter(Boolean))],
  };

  if (rowErrors.length) {
    logger.warn({ errors: rowErrors.length, sample: rowErrors.slice(0, 5) }, "registration import rejected");
    return res.status(200).json({ ok: false, errors: rowErrors.slice(0, 100), summary });
  }

  // Data is clean → relate each city to Google Places (canonical name + place_id);
  // if Places doesn't find it (or is down), keep the typed city and warn the reporter.
  // Country is per-crusade, so each city is geocoded against its own country.
  const cityCache = new Map();
  const warnings = [];
  for (const c of items) {
    if (!c.city) continue;
    const resolved = await resolveCity(c.city, c.country, cityCache, warnings, "registration import");
    c.city = resolved.name;
    c.city_place_id = resolved.place_id;
  }

  // Final schema gate (catches anything the field checks didn't, e.g. missing
  // identity or a too-long event name). Non-network orgs have their planning
  // fields dropped by the schema defaults, so they're harmless.
  const parsed = registrationSchema.safeParse({
    organization_type: canonical?.organization_type || reg.organization_type,
    zone: canonical?.zone ?? reg.zone,
    group_name: canonical?.group_name ?? reg.group_name,
    zone_manual: canonical?.zone_manual ?? false,
    group_manual: canonical?.group_manual ?? false,
    church_name: reg.church_name,
    cell_name: reg.cell_name,
    network_name: reg.network_name,
    contact_name: reg.contact_name,
    contact_email: reg.contact_email,
    phone_country_code: reg.phone_country_code,
    phone_number: reg.phone_number,
    kingschat_username: reg.kingschat_username,
    items,
  });
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      const row = iss.path[0] === "items" && typeof iss.path[1] === "number" ? `Row ${iss.path[1] + 2}: ` : "";
      const field = iss.path[iss.path.length - 1];
      rowErrors.push(`${row}${field}: ${iss.message}`);
    }
    logger.warn({ errors: rowErrors }, "registration import schema rejected");
    return res.status(200).json({ ok: false, errors: rowErrors.slice(0, 100), summary });
  }

  // ---- Commit straight to the database (bulk files over the threshold) -------
  // Mirrors the manual submit path exactly: same schema, same canonicalization,
  // same insert transaction — so imported rows are indistinguishable from manual
  // registrations. city_place_id was already geocoded above.
  if (directCommit) {
    const registration = { ...parsed.data, items: parsed.data.items };
    const id = insertRegistration(registration);
    // Fire-and-forget housekeeping, same as the manual POST /registrations.
    import("./places.js").then(({ backfillCityCoords }) => backfillCityCoords().catch(() => {}));
    import("./registrations.js").then(({ backupDatabaseRolling }) => backupDatabaseRolling().catch((error) => logger.error({ err: error }, "registration backup failed")));
    logger.info({ ...summary, id }, "registration import committed");
    return res.status(201).json({ ok: true, committed: true, id, count: items.length, summary });
  }

  // Preview mode: the parsed rows go back to the client, which loads them into
  // the form so the reporter reviews and submits like a manual entry. Over the
  // threshold we ship no rows — just the flag that forces the direct commit.
  logger.info(summary, "registration import parsed");
  res.status(200).json({
    ok: true,
    errors: [],
    // Cap so a huge file (tens of thousands of rows) can't freeze the preview.
    warnings: warnings.slice(0, 100),
    summary,
    commit_required: items.length > DIRECT_COMMIT_THRESHOLD,
    // Echo the canonicalized org identity back so the client can sync its pickers
    // (e.g. a manual zone flag the server set, or a canonical zone casing).
    organization: {
      organization_type: parsed.data.organization_type,
      zone: parsed.data.zone,
      group_name: parsed.data.group_name,
      zone_manual: parsed.data.zone_manual,
      group_manual: parsed.data.group_manual,
      church_name: parsed.data.church_name,
      cell_name: parsed.data.cell_name,
      network_name: parsed.data.network_name,
    },
    items: items.length > DIRECT_COMMIT_THRESHOLD ? null : parsed.data.items,
  });
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

// Comma-joined spreadsheet cell → trimmed string array (empty entries dropped).
// The server stores these as comma-joined strings via joinList in registrations.js;
// the array shape here is what registrationSchema expects.
function splitList(value) {
  return String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
}
