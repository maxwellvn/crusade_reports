import { Router } from "express";
import { db } from "../db.js";
import { requireAdmin } from "../auth.js";
import { wrap } from "../logger.js";
import { loadZones } from "./zones.js";
import { sendExport, sendTextDownload } from "./exporter.js";
import { buildCoverageRows } from "../coverage.js";

export const coverage = Router();

const exportColumns = (type) => type === "groups" ? [
  { header: "Group", value: (row) => row.name },
  { header: "Zone", value: (row) => row.zone },
  { header: "Region", value: (row) => row.region },
  { header: "Registration status", value: (row) => row.status === "registered" ? "Registered" : "Not registered" },
  { header: "Crusades registered", value: (row) => row.crusades },
] : [
  { header: "Zone", value: (row) => row.name },
  { header: "Region", value: (row) => row.region },
  { header: "Registration status", value: (row) => row.status === "registered" ? "Registered" : "Not registered" },
  { header: "Crusades registered", value: (row) => row.crusades },
];

async function coverageData() {
  const directory = await loadZones();
  const reported = db.prepare(`
    SELECT zone, group_name, COALESCE(SUM(planned_count), 0) AS crusades, 0 AS attendance
    FROM registration_items
    WHERE zone IS NOT NULL AND TRIM(zone) <> ''
      AND (program = 'public' OR program IS NULL)
    GROUP BY zone COLLATE NOCASE, group_name COLLATE NOCASE
  `).all();
  return buildCoverageRows(directory, reported);
}

coverage.get("/", requireAdmin, wrap(async (_req, res) => res.json(await coverageData())));

coverage.get("/export", requireAdmin, wrap(async (req, res) => {
  const type = req.query.type === "groups" ? "groups" : "zones";
  const status = ["registered", "not_registered"].includes(req.query.status) ? req.query.status : "";
  const query = String(req.query.q || "").trim().toLowerCase();
  const data = await coverageData();
  const rows = data[type].filter((row) => (!status || row.status === status)
    && (!query || [row.name, row.zone, row.region].some((value) => String(value || "").toLowerCase().includes(query))));
  const format = ["xlsx", "pdf"].includes(req.query.format) ? req.query.format : "csv";
  await sendExport(res, format, `${type}-crusade-coverage`, exportColumns(type), rows);
}));

coverage.get("/unregistered-zones/export", requireAdmin, wrap(async (req, res) => {
  const data = await coverageData();
  const rows = data.zones.filter((row) => row.status === "not_registered")
    .map((row, index) => ({ ...row, number: index + 1 }));
  const baseName = "zones-without-registered-crusades";
  if (req.query.format === "txt") {
    return sendTextDownload(res, baseName, [
      "ZONES WITHOUT A REGISTERED CRUSADE",
      `Total: ${rows.length}`,
      "",
      ...rows.map((row, index) => `${index + 1}. ${row.name}`),
    ]);
  }
  await sendExport(res, "pdf", baseName, [
    { header: "#", value: (row) => row.number, pdfWidth: 0.35, align: "right" },
    { header: "Zone", value: (row) => row.name, pdfWidth: 3.25 },
    { header: "Region", value: (row) => row.region, pdfWidth: 2 },
  ], rows);
}));
