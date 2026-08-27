import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

import { logger, errorHandler } from "./logger.js";
import { auth, requireAdmin } from "./auth.js";
import { reports } from "./routes/reports.js";
import { networks } from "./routes/networks.js";
import { zones } from "./routes/zones.js";
import { places, backfillCityCoords } from "./routes/places.js";
import { countries } from "./routes/countries.js";
import { importer } from "./routes/importer.js";
import { stats } from "./routes/stats.js";
import { dashboardLayout } from "./routes/dashboardLayout.js";
import { crusades } from "./routes/crusades.js";
import { registrations } from "./routes/registrations.js";
import { zonePortal } from "./routes/zonePortal.js";
import { campaignSettings } from "./routes/campaignSettings.js";
import { blueElite } from "./routes/blueElite.js";
import { resources, RESOURCE_FILES_DIR } from "./routes/resources.js";
import { missionNations } from "./routes/missionNations.js";
import { mediaTraining } from "./routes/mediaTraining.js";
import { missionTrips } from "./routes/missionTrips.js";
import { upcomingCrusades } from "./routes/upcomingCrusades.js";
import { translation } from "./routes/translation.js";
import { coverage } from "./routes/coverage.js";
import { countryCoverage } from "./routes/countryCoverage.js";
import { countryConsolidation } from "./routes/countryConsolidation.js";
import { pastoralChecklist } from "./routes/pastoralChecklist.js";
import { databaseProtection } from "./routes/databaseProtection.js";
import { startDatabaseProtection, stopDatabaseProtection } from "./databaseProtection.js";
import { renderPageMetadata } from "./pageMeta.js";
import { scheduleRegistrationDashboardRefresh } from "./registrationDashboardSnapshot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1); // Coolify terminates HTTPS before forwarding to Node.
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", auth);
app.use("/resource-files", express.static(RESOURCE_FILES_DIR, {
  fallthrough: false,
  maxAge: "1d",
  setHeaders: (res, path) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    if (!/\.(?:jpe?g|png|webp|gif)$/i.test(path)) res.setHeader("Content-Disposition", "attachment");
  },
}));
// Cheap probe retained for clients that only need an authenticated check.
app.get("/api/admin/check", requireAdmin, (req, res) => res.json({ ok: true, user: req.admin }));
app.use("/api/reports", reports);
app.use("/api/networks", networks);
app.use("/api/zones", zones);
app.use("/api/places", places);
app.use("/api/countries", countries);
app.use("/api/import", importer);
app.use("/api/stats", stats);
app.use("/api/dashboard-layout", dashboardLayout);
app.use("/api/crusades", crusades);
app.use("/api/registrations", registrations);
app.use("/api/campaign-settings", campaignSettings);
app.use("/api/blue-elite", blueElite);
app.use("/api/resources", resources);
app.use("/api/mission-nations", missionNations);
app.use("/api/media-training", mediaTraining);
app.use("/api/mission-trips", missionTrips);
app.use("/api/upcoming-crusades", upcomingCrusades);
app.use("/api/translation", translation);
app.use("/api/coverage", coverage);
app.use("/api/country-coverage", countryCoverage);
app.use("/api/admin/country-consolidation", countryConsolidation);
app.use("/api/zone-checklist", pastoralChecklist);
app.use("/api/admin/database-protection", databaseProtection);
app.use("/api", zonePortal);

// 404 for unknown API routes (before the SPA catch-all).
app.use("/api", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }));

// Serve the built client in production; the SPA handles routing.
const dist = join(__dirname, "..", "client", "dist");
if (existsSync(dist)) {
  const indexTemplate = readFileSync(join(dist, "index.html"), "utf8");
  app.use(express.static(dist, { index: false }));
  app.get("*", (req, res) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.type("html").send(renderPageMetadata(indexTemplate, req.path, origin));
  });
}

app.use(errorHandler);

await startDatabaseProtection();
const server = app.listen(PORT, () => logger.info(`crusade_reports listening on http://localhost:${PORT}`));
scheduleRegistrationDashboardRefresh();

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    stopDatabaseProtection();
    server.close(() => process.exit(0));
  });
}

// Catch up any crusades still missing city coordinates (pre-migration rows,
// or geocodes that failed at submit time).
backfillCityCoords().catch(() => {});
