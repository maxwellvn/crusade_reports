import { parentPort, workerData } from "node:worker_threads";
import { createWriteStream } from "node:fs";
import Database from "better-sqlite3";
import { writePortalReportWorkbookStream } from "./portalReportTemplate.js";

let database;
try {
  database = new Database(workerData.reportsPath, { readonly: true, fileMustExist: true });
  if (workerData.registrationPath) database.prepare("ATTACH DATABASE ? AS registration_store").run(workerData.registrationPath);
  const registrationItems = workerData.registrationPath ? "registration_store.registration_items" : "registration_items";
  const rows = database.prepare(`
    SELECT i.id, i.event_type,
           CASE WHEN i.event_type = 'other' THEN COALESCE(NULLIF(i.other_event_type, ''), 'Other') ELSE COALESCE(i.other_event_type, '') END AS other_event_type,
           i.event_name, COALESCE(i.event_date, i.plan_date) AS event_date,
           i.country, i.city, i.city_place_id, i.venue, i.minister_name
    FROM ${registrationItems} i
    WHERE i.${workerData.col} = ? AND (i.program = 'public' OR i.program IS NULL)
      AND NOT EXISTS (SELECT 1 FROM main.crusades c WHERE c.registration_item_id = i.id)
    ORDER BY COALESCE(i.event_date, i.plan_date), i.id
  `).iterate(workerData.name);
  await writePortalReportWorkbookStream(rows, workerData.dashboardName, createWriteStream(workerData.outputPath));
  database.close();
  parentPort.postMessage({ ok: true });
} catch (error) {
  try { database?.close(); } catch { /* best effort */ }
  parentPort.postMessage({ ok: false, message: error.message, stack: error.stack });
}
