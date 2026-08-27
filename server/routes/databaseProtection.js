import { Router } from "express";
import multer from "multer";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { requireSuperAdmin } from "../auth.js";
import { backupDatabase, databaseProtectionStatus, stageDatabaseRestore } from "../databaseProtection.js";
import { ApiError, wrap } from "../logger.js";

export const databaseProtection = Router();
const upload = multer({ dest: tmpdir(), limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 2 } });

databaseProtection.get("/", requireSuperAdmin, (_req, res) => res.json(databaseProtectionStatus()));

databaseProtection.post("/backup", requireSuperAdmin, wrap(async (_req, res) => {
  const result = await backupDatabase("manual");
  res.json({ ok: true, backup: result.name, bytes: result.bytes, registrationBackup: result.registration_name, registrationBytes: result.registration_bytes });
}));

databaseProtection.get("/download", requireSuperAdmin, wrap(async (_req, res) => {
  const result = await backupDatabase("manual-download");
  res.download(result.path, result.name);
}));

databaseProtection.post("/restore", requireSuperAdmin, upload.fields([
  { name: "backup", maxCount: 1 },
  { name: "registrationBackup", maxCount: 1 },
]), wrap(async (req, res) => {
  const reportsFile = req.files?.backup?.[0];
  const registrationFile = req.files?.registrationBackup?.[0];
  try {
    if (req.body?.confirmation !== "RESTORE DATABASE") {
      throw new ApiError(422, "RESTORE_CONFIRMATION_REQUIRED", "Type RESTORE DATABASE to confirm.");
    }
    if (!reportsFile) throw new ApiError(422, "BACKUP_REQUIRED", "Choose a SQLite backup file.");
    await stageDatabaseRestore(reportsFile.path, registrationFile?.path);
  } finally {
    if (reportsFile?.path) await unlink(reportsFile.path).catch(() => {});
    if (registrationFile?.path) await unlink(registrationFile.path).catch(() => {});
  }
  res.status(202).json({ ok: true, message: "Verified restore staged. The application is restarting." });
  res.once("finish", () => setTimeout(() => process.exit(0), 250));
}));
