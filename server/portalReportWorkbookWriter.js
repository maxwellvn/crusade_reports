// Authoring surface for the zone-portal / find-my-crusade Excel report
// templates. Kept SEPARATE from portalReportTemplate.js (which owns parsing)
// because that file imports the database — and the generation worker must not
// touch better-sqlite3: opening it inside a worker thread can hard-crash
// Node on exit. This module is pure JS (ExcelJS + label constants only).

import ExcelJS from "exceljs";
import { METRIC_LABELS } from "./labels.js";
import { ONLINE_TYPES, METRIC_KEYS } from "../client/src/lib/constants.js";

// Mirrors server/db.js METRIC_FIELDS (same members) without importing db.js.
const METRIC_FIELDS = METRIC_KEYS;

export const REGISTRATION_COLUMNS = [
  ["Registration ID", "registration_item_id"],
  ["Registered Crusade", "registered_event_name"],
  ["Registered Type", "registered_event_type"],
  ["Registered Date", "registered_event_date"],
  ["Country", "registered_country"],
];
export const REPORT_COLUMNS = [
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
export const PORTAL_TEMPLATE_EDITABLE_KEYS = new Set([
  "attendance",
  "online_participation",
  "crusade_expense",
  ...METRIC_FIELDS.filter((field) => field !== "online_participation"),
  "photo_links",
  "video_links",
]);

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
  sheet.columns = PORTAL_TEMPLATE_COLUMNS.map(([header, key]) => ({ header, key, width: Math.min(Math.max(header.length + 3, 15), 28) }));
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: REGISTRATION_COLUMNS.length }];
  sheet.autoFilter = { from: "A1", to: sheet.getRow(1).getCell(PORTAL_TEMPLATE_COLUMNS.length).address };
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell((cell, column) => {
    const editable = PORTAL_TEMPLATE_EDITABLE_KEYS.has(PORTAL_TEMPLATE_COLUMNS[column - 1][1]);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: editable ? "FF047857" : "FF1E3A8A" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  rows.forEach((row) => {
    const added = sheet.addRow(rowToCells(row));
    added.eachCell((cell, column) => {
      const key = PORTAL_TEMPLATE_COLUMNS[column - 1][1];
      const editable = PORTAL_TEMPLATE_EDITABLE_KEYS.has(key);
      cell.protection = { locked: !editable };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: editable ? "FFF0FDF4" : "FFEFF6FF" } };
      cell.alignment = { vertical: "top", wrapText: true };
      if (key === "event_date") cell.numFmt = "yyyy-mm-dd";
      if (["attendance", "online_participation", ...METRIC_FIELDS.filter((field) => field !== "online_participation")].includes(key)) {
        cell.numFmt = "0";
      }
      if (key === "crusade_expense") {
        cell.numFmt = "0.00";
      }
    });
  });
  styleInstructionsSheet(instructions, dashboardName);
  return workbook;
}

function rowToCells(row) {
  return {
    registration_item_id: row.id,
    registered_event_name: row.event_name,
    registered_event_type: row.event_type,
    registered_event_date: row.event_date,
    registered_country: row.country,
    submit: "Auto",
    format: ONLINE_TYPES.includes(row.event_type) ? "online" : "physical",
    other_event_type: row.other_event_type || "",
    event_date: row.event_date ? new Date(`${row.event_date}T00:00:00.000Z`) : "",
    city: row.city,
    venue: row.venue,
    minister_name: row.minister_name,
    attendance: "",
    online_participation: "",
    crusade_expense: "",
    ...Object.fromEntries(METRIC_FIELDS.filter((field) => field !== "online_participation").map((field) => [field, ""])),
    highlights: "",
    photo_links: "",
    video_links: "",
  };
}

function styleInstructionsSheet(instructions, dashboardName) {
  [
    ["NOTC Personal Dashboard Report Template"],
    [`Dashboard: ${dashboardName}`],
    ["1. Enter the report numbers and any photo or video links in the green cells. The registered crusade details cannot be changed here."],
    ["2. Complete only the rows you are reporting. A row is included automatically when at least one green cell has been filled."],
    ["3. Count fields accept only positive whole numbers or zero; expense accepts a positive number or zero."],
  ].forEach((row) => instructions.addRow(row));
  instructions.getColumn(1).width = 110;
  instructions.getRow(1).font = { bold: true, size: 16 };
  instructions.eachRow((row) => { row.alignment = { wrapText: true, vertical: "top" }; });
}

// The normal Workbook API retains every cell in memory. Personal dashboards can
// contain hundreds of thousands of pending registrations, so downloads use the
// streaming writer and commit each row as soon as it is serialized.
// useSharedStrings must stay ON: with it off the writer emits string cells as
// t="str" (the formula-result type) with no <f> element, which Excel flags as
// corrupt and offers to "repair". Shared strings only keep unique strings in
// the in-memory index; the values themselves still stream to disk.
export async function writePortalReportWorkbookStream(rows, dashboardName, stream) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: true });
  workbook.creator = "Night of a Thousand Crusades";
  const sheet = workbook.addWorksheet("Report Template", { views: [{ state: "frozen", ySplit: 1, xSplit: REGISTRATION_COLUMNS.length }] });
  sheet.columns = PORTAL_TEMPLATE_COLUMNS.map(([header, key]) => ({ header, key, width: Math.min(Math.max(header.length + 3, 15), 28) }));
  sheet.autoFilter = { from: "A1", to: sheet.getRow(1).getCell(PORTAL_TEMPLATE_COLUMNS.length).address };
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell((cell, column) => {
    const editable = PORTAL_TEMPLATE_EDITABLE_KEYS.has(PORTAL_TEMPLATE_COLUMNS[column - 1][1]);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: editable ? "FF047857" : "FF1E3A8A" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.getRow(1).commit();

  // One validation range per editable column is dramatically cheaper than
  // retaining a validation object for every cell in a very large worksheet.
  const fullColumnRange = (key) => {
    const letter = sheet.getColumn(columnNumber(key)).letter;
    return `${letter}2:${letter}1048576`;
  };
  for (const key of ["attendance", "online_participation", ...METRIC_FIELDS.filter((field) => field !== "online_participation")]) {
    sheet.dataValidations.add(fullColumnRange(key), { type: "whole", operator: "between", allowBlank: true, formulae: [0, MAX_COUNT], ...validationError("Enter a whole number from 0 to 2,147,483,647.") });
  }
  sheet.dataValidations.add(fullColumnRange("crusade_expense"), { type: "decimal", operator: "between", allowBlank: true, formulae: [0, MAX_EXPENSE], ...validationError("Enter a positive number or zero.") });
  for (const key of ["photo_links", "video_links"]) {
    sheet.dataValidations.add(fullColumnRange(key), { type: "textLength", operator: "lessThanOrEqual", allowBlank: true, formulae: [8000], ...validationError("Use no more than 8,000 characters.") });
  }

  for (const row of rows) {
    const added = sheet.addRow(rowToCells(row));
    added.eachCell((cell, column) => {
      const key = PORTAL_TEMPLATE_COLUMNS[column - 1][1];
      const editable = PORTAL_TEMPLATE_EDITABLE_KEYS.has(key);
      cell.protection = { locked: !editable };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: editable ? "FFF0FDF4" : "FFEFF6FF" } };
      cell.alignment = { vertical: "top", wrapText: true };
      if (key === "event_date") cell.numFmt = "yyyy-mm-dd";
      if (["attendance", "online_participation", ...METRIC_FIELDS.filter((field) => field !== "online_participation")].includes(key)) {
        cell.numFmt = "0";
      }
      if (key === "crusade_expense") {
        cell.numFmt = "0.00";
      }
    });
    added.commit();
  }
  await sheet.protect("notc-report-template", {
    selectLockedCells: false, selectUnlockedCells: true, formatRows: false, formatColumns: false,
    insertRows: false, deleteRows: false, insertColumns: false, deleteColumns: false, sort: false, autoFilter: true,
  });
  sheet.commit();

  const instructions = workbook.addWorksheet("Instructions");
  instructions.getColumn(1).width = 110;
  styleInstructionsSheet(instructions, dashboardName);

  return workbook.commit();
}
