import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

process.env.CRUSADE_DB_PATH = join(tmpdir(), `notc-network-template-${randomUUID()}.sqlite`);

const { db } = await import("./db.js");
const { buildPortalReportWorkbook, parsePortalReportWorkbook, PORTAL_TEMPLATE_COLUMNS } = await import("./portalReportTemplate.js");
const { portalReportTemplateRows } = await import("./routes/zonePortal.js");

function addNetworkRegistration(networkName, eventName) {
  const registrationId = db.prepare(`
    INSERT INTO registrations (organization_type, network_name, country, plan_date)
    VALUES ('network', ?, 'Nigeria', '2026-08-28')
  `).run(networkName).lastInsertRowid;
  return db.prepare(`
    INSERT INTO registration_items (registration_id, organization_type, network_name, country, plan_date,
      event_type, planned_count, event_name, event_date, venue, expected_attendance, minister_name, city)
    VALUES (?, 'network', ?, 'Nigeria', '2026-08-28', 'mega', 1, ?, '2026-08-28',
      'Main Auditorium', 1000, 'Pastor Test', 'Lagos')
  `).run(registrationId, networkName, eventName).lastInsertRowid;
}

function markReported(itemId, networkName, eventName) {
  const reportId = db.prepare(`
    INSERT INTO reports (organization_type, network_name, country)
    VALUES ('network', ?, 'Nigeria')
  `).run(networkName).lastInsertRowid;
  db.prepare(`
    INSERT INTO crusades (report_id, organization_type, network_name, country, format, event_type,
      event_name, city, event_date, attendance, registration_item_id)
    VALUES (?, 'network', ?, 'Nigeria', 'physical', 'mega', ?, 'Lagos', '2026-08-28', 1000, ?)
  `).run(reportId, networkName, eventName, itemId);
}

test("network personal dashboard template contains its pending registered crusades", async () => {
  const pendingId = addNetworkRegistration("TNI", "TNI Pending Crusade");
  const reportedId = addNetworkRegistration("TNI", "TNI Reported Crusade");
  addNetworkRegistration("REON", "Other Network Crusade");
  markReported(reportedId, "TNI", "TNI Reported Crusade");

  const rows = portalReportTemplateRows({ name: "TNI", col: "network_name" });
  assert.deepEqual(rows.map((row) => row.id), [pendingId]);

  const workbook = await buildPortalReportWorkbook(rows, "TNI network dashboard");
  const sheet = workbook.getWorksheet("Report Template");
  const column = (key) => PORTAL_TEMPLATE_COLUMNS.findIndex(([, field]) => field === key) + 1;
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getRow(2).getCell(column("registration_item_id")).value, pendingId);
  assert.equal(sheet.getRow(2).getCell(column("registered_event_name")).value, "TNI Pending Crusade");
  assert.equal(sheet.getRow(2).getCell(column("registered_event_type")).value, "mega");
  assert.equal(sheet.getRow(2).getCell(column("registered_country")).value, "Nigeria");

  sheet.getRow(2).getCell(column("attendance")).value = 750;
  const uploaded = await parsePortalReportWorkbook(await workbook.xlsx.writeBuffer());
  assert.deepEqual(uploaded.errors, []);
  assert.equal(uploaded.reports.length, 1);
  assert.equal(uploaded.reports[0].registration_item_id, pendingId);
  assert.equal(uploaded.reports[0].attendance, 750);
});
