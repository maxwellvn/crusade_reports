import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1); // Coolify terminates HTTPS before forwarding to Node.
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", auth);
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
app.use("/api", zonePortal);

// 404 for unknown API routes (before the SPA catch-all).
app.use("/api", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }));

// Serve the built client in production; the SPA handles routing.
const dist = join(__dirname, "..", "client", "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(join(dist, "index.html")));
}

app.use(errorHandler);

app.listen(PORT, () => logger.info(`crusade_reports listening on http://localhost:${PORT}`));

// Catch up any crusades still missing city coordinates (pre-migration rows,
// or geocodes that failed at submit time).
backfillCityCoords().catch(() => {});
