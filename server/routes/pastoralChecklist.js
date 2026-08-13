import { Router } from "express";
import { db } from "../db.js";
import { requirePageAccess } from "../auth.js";
import { wrap } from "../logger.js";
import { buildPastoralChecklistRows, filterPastoralChecklistRows, pastoralChecklistSummary } from "../pastoralChecklist.js";
import { sendExport } from "./exporter.js";
import { loadZones } from "./zones.js";

export const pastoralChecklist = Router();
const PAGE_KEY = "dashboard/pastoral-checklist";

export async function pastoralChecklistData() {
  const directory = await loadZones();
  const registrationRows = db.prepare(`
    SELECT zone,
      COALESCE(SUM(planned_count), 0) AS registered_crusades,
      COALESCE(SUM(CASE WHEN organization_type = 'cell' OR event_type = 'rabah' THEN planned_count ELSE 0 END), 0) AS cellular_crusades,
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(event_name, '') || ' ' || COALESCE(other_event_type, '')) LIKE '%prayer%march%' THEN 1 ELSE 0 END), 0) AS prayer_march_records,
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(event_name, '') || ' ' || COALESCE(other_event_type, '')) LIKE '%wonders%'
        AND LOWER(COALESCE(event_name, '') || ' ' || COALESCE(other_event_type, '')) LIKE '%diamond%' THEN 1 ELSE 0 END), 0) AS wonders_diamond_records
    FROM registration_items
    WHERE zone IS NOT NULL AND TRIM(zone) <> ''
      AND (program = 'public' OR program IS NULL)
    GROUP BY zone COLLATE NOCASE
  `).all();
  const nationRows = db.prepare(`
    SELECT zone_name, pastor_name, mission_country_name, mission_country_names, created_at
    FROM mission_nation_selections
    WHERE minister_type = 'zonal_pastor' OR minister_type IS NULL
    ORDER BY created_at DESC, id DESC
  `).all();
  const rows = buildPastoralChecklistRows(directory, registrationRows, nationRows);
  return {
    rows,
    summary: pastoralChecklistSummary(rows),
    filter_options: { regions: [...new Set(rows.map((row) => row.region).filter(Boolean))].sort((a, b) => a.localeCompare(b)) },
  };
}

const exportColumns = [
  { header: "Zone", value: (row) => row.zone, pdfWidth: 2.5 },
  { header: "Region", value: (row) => row.region, pdfWidth: 1.8 },
  { header: "Zonal Pastor", value: (row) => row.pastor_name || "Not identified", pdfWidth: 1.8 },
  { header: "NOTC Registered", value: (row) => row.has_registration ? "Yes" : "No", pdfWidth: 0.8 },
  { header: "Registered Crusades", value: (row) => row.registered_crusades, align: "right", pdfWidth: 0.8 },
  { header: "Cellular Registered", value: (row) => row.has_cellular ? "Yes" : "No", pdfWidth: 0.8 },
  { header: "Cellular Crusades", value: (row) => row.cellular_crusades, align: "right", pdfWidth: 0.8 },
  { header: "Nation Adoption", value: (row) => row.has_nation_selection ? "Yes" : "No", pdfWidth: 0.8 },
  { header: "Selected Nations", value: (row) => row.selected_nations.join(", "), pdfWidth: 1.7 },
  { header: "Prayer March Participation", value: (row) => row.has_prayer_march ? "Yes" : "No", pdfWidth: 1 },
  { header: "Wonders to Diamond Conference Hosted", value: (row) => row.has_wonders_diamond ? "Yes" : "No", pdfWidth: 1.2 },
  { header: "Checklist", value: (row) => `${row.completed_items}/5`, align: "right", pdfWidth: 0.6 },
];

pastoralChecklist.get("/", requirePageAccess(PAGE_KEY), wrap(async (_req, res) => {
  res.json(await pastoralChecklistData());
}));

pastoralChecklist.get("/export", requirePageAccess(PAGE_KEY), wrap(async (req, res) => {
  const data = await pastoralChecklistData();
  const rows = filterPastoralChecklistRows(data.rows, req.query);
  const format = ["csv", "xlsx", "pdf"].includes(req.query.format) ? req.query.format : "xlsx";
  await sendExport(res, format, "zone-accountability-checklist", exportColumns, rows, {
    title: "Zone Checklist for NOTC Accountability",
    subtitle: "Cellular crusades, nation adoption, Prayer March, Wonders to Diamond conference, and NOTC registration",
  });
}));
