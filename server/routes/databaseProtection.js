import { Router } from "express";
import multer from "multer";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { requirePageAccess } from "../auth.js";
import { backupDatabase, databaseProtectionStatus, stageDatabaseRestore } from "../databaseProtection.js";
import { ApiError, wrap } from "../logger.js";

export const databaseProtection = Router();
const upload = multer({ dest: tmpdir(), limits: { fileSize: 1024 * 1024 * 1024, files: 1 } });

databaseProtection.get("/", requirePageAccess("dashboard/database-protection"), (_req, res) => res.json(databaseProtectionStatus()));

databaseProtection.post("/backup", requirePageAccess("dashboard/database-protection"), wrap(async (_req, res) => {
  const result = await backupDatabase("manual");
  res.json({ ok: true, backup: result.name, bytes: result.bytes });
}));

databaseProtection.get("/download", requirePageAccess("dashboard/database-protection"), wrap(async (_req, res) => {
  const result = await backupDatabase("manual-download");
  res.download(result.path, result.name);
}));

databaseProtection.post("/restore", requirePageAccess("dashboard/database-protection"), upload.single("backup"), wrap(async (req, res) => {
  try {
    if (req.body?.confirmation !== "RESTORE DATABASE") {
      throw new ApiError(422, "RESTORE_CONFIRMATION_REQUIRED", "Type RESTORE DATABASE to confirm.");
    }
    if (!req.file) throw new ApiError(422, "BACKUP_REQUIRED", "Choose a SQLite backup file.");
    await stageDatabaseRestore(req.file.path);
  } finally {
    if (req.file?.path) await unlink(req.file.path).catch(() => {});
  }
  res.status(202).json({ ok: true, message: "Verified restore staged. The application is restarting." });
  res.once("finish", () => setTimeout(() => process.exit(0), 250));
}));
