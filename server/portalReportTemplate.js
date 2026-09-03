import ExcelJS from "exceljs";
import { METRIC_FIELDS } from "./db.js";
import {
  PORTAL_TEMPLATE_COLUMNS,
  PORTAL_TEMPLATE_EDITABLE_KEYS,
  REGISTRATION_COLUMNS,
  MAX_COUNT,
  MAX_EXPENSE,
} from "./portalReportWorkbookWriter.js";

export {
  PORTAL_TEMPLATE_COLUMNS,
  PORTAL_TEMPLATE_EDITABLE_KEYS,
  REGISTRATION_COLUMNS,
  buildPortalReportWorkbook,
  writePortalReportWorkbookStream,
} from "./portalReportWorkbookWriter.js";
export { REPORT_COLUMNS } from "./portalReportWorkbookWriter.js";


const normalizedHeader = (value) => String(value || "").trim().toLowerCase();
// Wrong-door hint: the general report-form template (from /report) has its own
// sheet and headers. Tell the reporter where that file actually works.
const GENERAL_TEMPLATE_HINT = "This looks like the general report template from the Report a Crusade page. Upload it there via \"Import a spreadsheet\" — this portal only accepts the template downloaded from this page's \"Download Excel template\" button.";
function headerLooksLikeGeneralTemplate(headerRow) {
  let looksGeneral = false;
  headerRow.eachCell((cell) => {
    if (normalizedHeader(cell.value) === "crusade type") looksGeneral = true;
  });
  return looksGeneral;
}
const cellText = (cell) => {
  const value = cell?.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") return String(value.text ?? value.result ?? "").trim();
  return String(value).trim();
};
const numberValue = (value) => {
  const text = String(value ?? "").replaceAll(",", "").trim();
  return text === "" ? 0 : Number(text);
};
function reportColumnMap(headerRow) {
  const columnByKey = {};
  headerRow.eachCell((cell, column) => {
    const match = PORTAL_TEMPLATE_COLUMNS.find(([header]) => normalizedHeader(header) === normalizedHeader(cell.value));
    if (match) columnByKey[match[1]] = column;
  });
  return columnByKey;
}

function parseReportRow(row, rowNumber, columnByKey, seen, errors) {
  const text = (key) => columnByKey[key] ? cellText(row.getCell(columnByKey[key])) : "";
  const hasReportData = [...PORTAL_TEMPLATE_EDITABLE_KEYS].some((key) => text(key) !== "");
  if (!hasReportData) return null;
  const formulaFields = PORTAL_TEMPLATE_COLUMNS.filter(([, key]) => columnByKey[key] && row.getCell(columnByKey[key]).value?.formula).map(([header]) => header);
  if (formulaFields.length) errors.push(`Row ${rowNumber}: formulas are not allowed in ${formulaFields.join(", ")}. Enter direct values only.`);
  const id = Number.parseInt(text("registration_item_id"), 10);
  if (!Number.isInteger(id) || id < 1) errors.push(`Row ${rowNumber}: Registration ID is invalid.`);
  else if (seen.has(id)) errors.push(`Row ${rowNumber}: Registration ID ${id} appears more than once.`);
  else seen.add(id);

  const numeric = {};
  for (const key of ["attendance", "online_participation", "crusade_expense", ...METRIC_FIELDS.filter((field) => field !== "online_participation")]) {
    const value = numberValue(text(key));
    const maximum = key === "crusade_expense" ? MAX_EXPENSE : MAX_COUNT;
    if (!Number.isFinite(value) || value < 0 || value > maximum || (key !== "crusade_expense" && !Number.isInteger(value))) {
      errors.push(`Row ${rowNumber}: ${PORTAL_TEMPLATE_COLUMNS.find(([, field]) => field === key)?.[0] || key} must be zero or a positive ${key === "crusade_expense" ? "number" : "whole number"}.`);
    }
    numeric[key] = value;
  }
  return {
    row_number: rowNumber,
    registration_item_id: id,
    registered_event_name: text("registered_event_name"),
    registered_event_type: text("registered_event_type"),
    registered_event_date: text("registered_event_date"),
    registered_country: text("registered_country"),
    format: text("format").toLowerCase(),
    other_event_type: text("other_event_type"),
    event_date: text("event_date"),
    city: text("city"),
    venue: text("venue"),
    minister_name: text("minister_name"),
    highlights: text("highlights"),
    photo_links: text("photo_links"),
    video_links: text("video_links"),
    ...numeric,
  };
}

export async function parsePortalReportWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Report Template");
  if (!sheet) {
    if (workbook.getWorksheet("Crusades")) throw new Error(GENERAL_TEMPLATE_HINT);
    throw new Error("The workbook does not contain the Report Template sheet.");
  }

  const columnByKey = reportColumnMap(sheet.getRow(1));
  const requiredColumns = [...REGISTRATION_COLUMNS.map(([, key]) => key), "submit", "format", "event_date", "city", "venue", "minister_name", "attendance"];
  const missing = requiredColumns.filter((key) => !columnByKey[key]);
  if (missing.length) {
    if (headerLooksLikeGeneralTemplate(sheet.getRow(1))) throw new Error(GENERAL_TEMPLATE_HINT);
    throw new Error("Required template columns are missing. Download a fresh template and try again.");
  }

  const reports = [];
  const errors = [];
  const seen = new Set();
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const report = parseReportRow(sheet.getRow(rowNumber), rowNumber, columnByKey, seen, errors);
    if (report) reports.push(report);
  }
  if (!reports.length) errors.push("No report data was found in the file. Fill at least one green cell with a report number (attendance, outcome, or expense) or a photo/video evidence link, save the file as .xlsx, then upload it again.");
  return { reports, errors };
}

export async function parsePortalReportWorkbookFile(path) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, {
    worksheets: "emit", sharedStrings: "cache", styles: "ignore", hyperlinks: "ignore",
  });
  const reports = [];
  const errors = [];
  const seen = new Set();
  let found = false;
  for await (const sheet of reader) {
    // The protected report worksheet is always first. ExcelJS may expose
    // streaming-writer sheet names as Sheet1, so sheet id is authoritative.
    if (String(sheet.id) !== "1") continue;
    found = true;
    let columnByKey = null;
    for await (const row of sheet) {
      if (!columnByKey) {
        columnByKey = reportColumnMap(row);
        const required = [...REGISTRATION_COLUMNS.map(([, key]) => key), "submit", "format", "event_date", "city", "venue", "minister_name", "attendance"];
        const missing = required.filter((key) => !columnByKey[key]);
        if (missing.length) {
          if (headerLooksLikeGeneralTemplate(row)) throw new Error(GENERAL_TEMPLATE_HINT);
          throw new Error("Required template columns are missing. Download a fresh template and try again.");
        }
        continue;
      }
      const report = parseReportRow(row, row.number, columnByKey, seen, errors);
      if (report) reports.push(report);
    }
  }
  if (!found) throw new Error(`The workbook does not contain the report template sheet. ${GENERAL_TEMPLATE_HINT}`);
  if (!reports.length) errors.push("No report data was found in the file. Fill at least one green cell with a report number (attendance, outcome, or expense) or a photo/video evidence link, save the file as .xlsx, then upload it again.");
  return { reports, errors };
}
