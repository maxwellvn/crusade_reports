import { Router } from "express";
import { requirePageAccess } from "../auth.js";
import { cachedDashboardData } from "../dashboardCache.js";
import { collectiveReportData } from "../collectiveReportData.js";
import { buildCollectiveReportPdf, buildCollectiveReportWorkbook } from "../collectiveReportFiles.js";
import { wrap } from "../logger.js";

export const collectiveReport = Router();
const PAGE_KEY = "dashboard/collective-report";

const currentData = () => cachedDashboardData("collective-report", collectiveReportData, 60_000);
const dateStamp = () => new Date().toISOString().slice(0, 10);

collectiveReport.get("/", requirePageAccess(PAGE_KEY), wrap((_req, res) => {
  res.setHeader("Cache-Control", "private, no-cache");
  res.json(currentData());
}));

collectiveReport.get("/export.pdf", requirePageAccess(PAGE_KEY), wrap(async (_req, res) => {
  const buffer = await buildCollectiveReportPdf(currentData());
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="comprehensive-crusade-report-${dateStamp()}.pdf"`);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", "private, no-store");
  res.end(buffer);
}));

collectiveReport.get("/export.xlsx", requirePageAccess(PAGE_KEY), wrap(async (_req, res) => {
  const buffer = await buildCollectiveReportWorkbook(currentData());
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="collective-report-ecard-figures-${dateStamp()}.xlsx"`);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", "private, no-store");
  res.end(buffer);
}));
