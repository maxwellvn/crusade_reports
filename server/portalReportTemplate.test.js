import test from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import {
  buildPortalReportWorkbook,
  parsePortalReportWorkbook,
  PORTAL_TEMPLATE_COLUMNS,
} from "./portalReportTemplate.js";
import { generatePortalReportTemplate, removeGeneratedTemplate } from "./portalReportTemplateJobs.js";

test("downloaded personal dashboard templates use Excel-compatible worksheet element order", async (t) => {
  const path = await generatePortalReportTemplate({
    rows: [{
      id: 770001,
      event_name: "Abuja Ministry Center Crusade",
      event_type: "mega",
      event_date: "2026-09-03",
      country: "Nigeria",
      city: "Abuja",
      venue: "Ministry Center",
      minister_name: "Pastor Test",
    }],
    dashboardName: "Abuja Ministry Center dashboard",
  });
  t.after(() => removeGeneratedTemplate(path));

  const worksheetXml = new AdmZip(path).readAsText("xl/worksheets/sheet1.xml");
  const sheetDataEnd = worksheetXml.indexOf("</sheetData>");
  const protection = worksheetXml.indexOf("<sheetProtection");
  const autoFilter = worksheetXml.indexOf("<autoFilter");
  const validations = worksheetXml.indexOf("<dataValidations");

  assert.ok(sheetDataEnd >= 0);
  assert.ok(sheetDataEnd < protection, "sheet protection must follow sheet data");
  assert.ok(protection < autoFilter, "sheet protection must precede the auto-filter");
  assert.ok(autoFilter < validations, "the auto-filter must precede data validations");
});

test("personal dashboard report imports support more than 1,000 registration rows", async () => {
  const registrations = Array.from({ length: 1001 }, (_, index) => ({
    id: 990000 + index,
    event_name: `Bulk Report Test ${index + 1}`,
    event_type: "cellular",
    event_date: "2026-08-28",
    country: "Nigeria",
    city: "Lagos",
    venue: `Test Venue ${index + 1}`,
    minister_name: "Pastor Test",
  }));
  const workbook = await buildPortalReportWorkbook(registrations, "Large Test Zone dashboard");
  const sheet = workbook.getWorksheet("Report Template");
  const attendanceColumn = PORTAL_TEMPLATE_COLUMNS.findIndex(([, field]) => field === "attendance") + 1;

  sheet.getRow(1002).getCell(attendanceColumn).value = 25;
  let parsed = await parsePortalReportWorkbook(await workbook.xlsx.writeBuffer());
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.reports.length, 1);
  assert.equal(parsed.reports[0].registration_item_id, registrations.at(-1).id);

  for (let rowNumber = 2; rowNumber <= 1002; rowNumber += 1) {
    sheet.getRow(rowNumber).getCell(attendanceColumn).value = 25;
  }
  parsed = await parsePortalReportWorkbook(await workbook.xlsx.writeBuffer());
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.reports.length, 1001);
});

test("an unchanged personal dashboard template gives explicit empty-report feedback", async () => {
  const workbook = await buildPortalReportWorkbook([{
    id: 880001,
    event_name: "Unfilled report",
    event_type: "street",
    event_date: "2026-08-28",
    country: "Nigeria",
    city: "Lagos",
    venue: "Test Venue",
    minister_name: "Pastor Test",
  }], "Test Zone dashboard");
  const parsed = await parsePortalReportWorkbook(await workbook.xlsx.writeBuffer());
  assert.equal(parsed.reports.length, 0);
  assert.deepEqual(parsed.errors, [
    "No report data was found in the file. Fill at least one green cell with a report number (attendance, outcome, or expense) or a photo/video evidence link, save the file as .xlsx, then upload it again.",
  ]);
});
