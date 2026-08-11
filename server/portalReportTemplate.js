import ExcelJS from "exceljs";
import { METRIC_FIELDS } from "./db.js";
import { METRIC_LABELS } from "./labels.js";
import { ONLINE_TYPES } from "../client/src/lib/constants.js";

const REGISTRATION_COLUMNS = [
  ["Registration ID", "registration_item_id"],
  ["Registered Crusade", "registered_event_name"],
  ["Registered Type", "registered_event_type"],
  ["Registered Date", "registered_event_date"],
  ["Country", "registered_country"],
];
const REPORT_COLUMNS = [
  ["Submit Report?", "submit"],
  ["Format", "format"],
  ["Other Crusade Type", "other_event_type"],
  ["Date Held", "event_date"],
  ["City", "city"],
  ["Venue / Address", "venue"],
  ["Minister", "minister_name"],
  ["Onsite Attendance", "attendance"],
  ["Online Attendance", "online_participation"],
  ["Crusade Expense", "crusade_expense"],
  ...METRIC_FIELDS.filter((field) => field !== "online_participation").map((field) => [METRIC_LABELS[field] || field, field]),
  ["Highlights", "highlights"],
  ["Photo Links", "photo_links"],
  ["Video Links", "video_links"],
];
export const PORTAL_TEMPLATE_COLUMNS = [...REGISTRATION_COLUMNS, ...REPORT_COLUMNS];

const normalizedHeader = (value) => String(value || "").trim().toLowerCase();
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
const columnNumber = (key) => PORTAL_TEMPLATE_COLUMNS.findIndex(([, field]) => field === key) + 1;
const MAX_COUNT = 2_147_483_647;
const MAX_EXPENSE = 1_000_000_000_000_000;

function validationError(message) {
  return { showErrorMessage: true, errorStyle: "stop", errorTitle: "Invalid value", error: message };
}

export async function buildPortalReportWorkbook(rows, dashboardName) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Night of a Thousand Crusades";
  const sheet = workbook.addWorksheet("Report Template");
  const instructions = workbook.addWorksheet("Instructions");
  const lists = workbook.addWorksheet("Lists");
  lists.state = "veryHidden";

  sheet.columns = PORTAL_TEMPLATE_COLUMNS.map(([header, key]) => ({ header, key, width: Math.min(Math.max(header.length + 3, 15), 28) }));
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: REGISTRATION_COLUMNS.length }];
  sheet.autoFilter = { from: "A1", to: sheet.getRow(1).getCell(PORTAL_TEMPLATE_COLUMNS.length).address };
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell((cell, column) => {
    const editable = column > REGISTRATION_COLUMNS.length;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: editable ? "FF047857" : "FF1E3A8A" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  rows.forEach((row) => {
    const added = sheet.addRow({
      registration_item_id: row.id,
      registered_event_name: row.event_name,
      registered_event_type: row.event_type,
      registered_event_date: row.event_date,
      registered_country: row.country,
      submit: "",
      format: ONLINE_TYPES.includes(row.event_type) ? "online" : "physical",
      other_event_type: "",
      event_date: row.event_date ? new Date(`${row.event_date}T00:00:00.000Z`) : "",
      city: row.city,
      venue: row.venue,
      minister_name: row.minister_name,
      attendance: 0,
      online_participation: 0,
      crusade_expense: 0,
      ...Object.fromEntries(METRIC_FIELDS.filter((field) => field !== "online_participation").map((field) => [field, 0])),
      highlights: "",
      photo_links: "",
      video_links: "",
    });
    added.eachCell((cell, column) => {
      const editable = column > REGISTRATION_COLUMNS.length;
      cell.protection = { locked: !editable };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: editable ? "FFF0FDF4" : "FFEFF6FF" } };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });

  lists.getCell("A1").value = "Yes";
  lists.getCell("A2").value = "No";
  lists.getCell("B1").value = "physical";
  lists.getCell("B2").value = "online";
  for (let row = 2; row <= Math.max(sheet.rowCount, 2); row++) {
    sheet.getCell(row, columnNumber("submit")).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$A$1:$A$2"], ...validationError("Choose Yes or No from the dropdown.") };
    sheet.getCell(row, columnNumber("format")).dataValidation = { type: "list", allowBlank: false, formulae: ["Lists!$B$1:$B$2"], ...validationError("Choose physical or online from the dropdown.") };
    const dateCell = sheet.getCell(row, columnNumber("event_date"));
    dateCell.numFmt = "yyyy-mm-dd";
    dateCell.dataValidation = { type: "date", operator: "between", allowBlank: false, formulae: [new Date("2000-01-01T00:00:00.000Z"), new Date("2100-12-31T00:00:00.000Z")], ...validationError("Enter a valid date between 2000 and 2100.") };
    for (const key of ["attendance", "online_participation", ...METRIC_FIELDS.filter((field) => field !== "online_participation")]) {
      const cell = sheet.getCell(row, columnNumber(key));
      cell.numFmt = "0";
      cell.dataValidation = { type: "whole", operator: "between", allowBlank: true, formulae: [0, MAX_COUNT], ...validationError("Enter a whole number from 0 to 2,147,483,647.") };
    }
    const expenseCell = sheet.getCell(row, columnNumber("crusade_expense"));
    expenseCell.numFmt = "0.00";
    expenseCell.dataValidation = { type: "decimal", operator: "between", allowBlank: true, formulae: [0, MAX_EXPENSE], ...validationError("Enter a positive number or zero.") };
    for (const [key, maximum] of [["other_event_type", 200], ["city", 200], ["venue", 1000], ["minister_name", 300], ["highlights", 2000], ["photo_links", 8000], ["video_links", 8000]]) {
      sheet.getCell(row, columnNumber(key)).dataValidation = { type: "textLength", operator: "lessThanOrEqual", allowBlank: true, formulae: [maximum], ...validationError(`Use no more than ${maximum.toLocaleString()} characters.`) };
    }
  }
  await sheet.protect("notc-report-template", {
    selectLockedCells: false,
    selectUnlockedCells: true,
    formatRows: false,
    formatColumns: false,
    insertRows: false,
    deleteRows: false,
    insertColumns: false,
    deleteColumns: false,
    sort: false,
    autoFilter: true,
  });

  [
    ["NOTC Personal Dashboard Report Template"],
    [`Dashboard: ${dashboardName}`],
    ["1. Use only this downloaded workbook. Do not change the blue registration columns or Registration ID."],
    ["2. Choose Yes under Submit Report? only for crusades whose reports you are completing."],
    ["3. Complete the green report columns. Count fields accept only positive whole numbers or zero; expense accepts a positive number or zero."],
    ["4. Photo and video evidence should be entered as accessible links, including Google Drive links."],
    ["5. Save the workbook as .xlsx, upload it on the same dashboard, review the preview, then confirm submission."],
    ["6. Existing reports are never overwritten by this upload."],
  ].forEach((row) => instructions.addRow(row));
  instructions.getColumn(1).width = 110;
  instructions.getRow(1).font = { bold: true, size: 16 };
  instructions.eachRow((row) => { row.alignment = { wrapText: true, vertical: "top" }; });
  return workbook;
}

export async function parsePortalReportWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Report Template");
  if (!sheet) throw new Error("The workbook does not contain the Report Template sheet.");

  const columnByKey = {};
  sheet.getRow(1).eachCell((cell, column) => {
    const match = PORTAL_TEMPLATE_COLUMNS.find(([header]) => normalizedHeader(header) === normalizedHeader(cell.value));
    if (match) columnByKey[match[1]] = column;
  });
  const requiredColumns = [...REGISTRATION_COLUMNS.map(([, key]) => key), "submit", "format", "event_date", "city", "venue", "minister_name", "attendance"];
  const missing = requiredColumns.filter((key) => !columnByKey[key]);
  if (missing.length) throw new Error("Required template columns are missing. Download a fresh template and try again.");

  const reports = [];
  const errors = [];
  const seen = new Set();
  if (sheet.rowCount > 1001) errors.push("The workbook contains more than 1,000 report rows. Use a fresh dashboard template.");
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const text = (key) => columnByKey[key] ? cellText(row.getCell(columnByKey[key])) : "";
    const submit = text("submit").toLowerCase();
    if (!submit || submit === "no") continue;
    if (submit !== "yes") {
      errors.push(`Row ${rowNumber}: Submit Report? must be Yes or No.`);
      continue;
    }
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
    reports.push({
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
    });
  }
  if (!reports.length) errors.push("No rows are marked Yes under Submit Report?.");
  return { reports, errors };
}
