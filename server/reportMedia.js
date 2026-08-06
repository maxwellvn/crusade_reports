import multer from "multer";
import { mkdirSync, unlinkSync, createReadStream, existsSync } from "node:fs";
import { extname, join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { db } from "./db.js";
import { ApiError } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPORT_PHOTOS_DIR = join(__dirname, "..", "data", "report-photos");
mkdirSync(REPORT_PHOTOS_DIR, { recursive: true });

export const MAX_REPORT_PHOTOS_BYTES = 27 * 1024 * 1024;
export const MAX_REPORT_PHOTO_FILES = 40;

const ALLOWED_PHOTO_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const ALLOWED_PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);

const storage = multer.diskStorage({
  destination: REPORT_PHOTOS_DIR,
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname || "").toLowerCase().slice(0, 12);
    cb(null, `${randomUUID()}${ALLOWED_PHOTO_EXT.has(ext) ? ext : ".jpg"}`);
  },
});

function photoFilter(_req, file, cb) {
  const ext = extname(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  if (ALLOWED_PHOTO_MIME.has(mime) || ALLOWED_PHOTO_EXT.has(ext)) return cb(null, true);
  cb(new ApiError(400, "INVALID_PHOTO", "Only image files can be uploaded (JPEG, PNG, WebP, GIF, HEIC)."));
}

export const reportPhotoUpload = multer({
  storage,
  fileFilter: photoFilter,
  limits: { files: MAX_REPORT_PHOTO_FILES, fileSize: MAX_REPORT_PHOTOS_BYTES },
}).array("photos", MAX_REPORT_PHOTO_FILES);

export function removeUploadedFiles(files) {
  for (const file of files || []) {
    if (!file?.filename && !file?.path) continue;
    const path = file.path || join(REPORT_PHOTOS_DIR, file.filename);
    try { unlinkSync(path); } catch { /* best effort */ }
  }
}

export function parseReportPayload(req) {
  if (req.is("multipart/form-data") || Array.isArray(req.files)) {
    const raw = req.body?.payload ?? req.body?.data;
    if (raw == null || raw === "") return { ...(req.body || {}) };
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new ApiError(400, "VALIDATION", "Invalid report payload.");
      }
      return parsed;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, "VALIDATION", "Invalid report payload.");
    }
  }
  return req.body || {};
}

export function composeMediaLinks(photoLinks = "", videoLinks = "") {
  const sections = [];
  const photos = String(photoLinks || "").trim();
  const videos = String(videoLinks || "").trim();
  if (photos) sections.push(`Photo links:\n${photos}`);
  if (videos) sections.push(`Video links:\n${videos}`);
  return sections.join("\n\n") || null;
}

export function assertPhotoUploadBudget(files = []) {
  const total = files.reduce((sum, file) => sum + (file.size || 0), 0);
  if (total > MAX_REPORT_PHOTOS_BYTES) {
    removeUploadedFiles(files);
    throw new ApiError(400, "PHOTOS_TOO_LARGE", "Photos must total 27MB or less.");
  }
  return total;
}

const insertPhotoStmt = db.prepare(`
  INSERT INTO report_photos (report_id, stored_name, original_name, mime_type, size_bytes)
  VALUES (?, ?, ?, ?, ?)
`);

export function saveReportPhotos(reportId, files = []) {
  if (!files.length) return [];
  assertPhotoUploadBudget(files);
  const rows = [];
  const save = db.transaction(() => {
    for (const file of files) {
      const result = insertPhotoStmt.run(
        reportId,
        file.filename,
        String(file.originalname || file.filename).slice(0, 255),
        String(file.mimetype || "application/octet-stream").slice(0, 120),
        file.size || 0,
      );
      rows.push({
        id: result.lastInsertRowid,
        report_id: reportId,
        stored_name: file.filename,
        original_name: String(file.originalname || file.filename).slice(0, 255),
        mime_type: String(file.mimetype || "application/octet-stream").slice(0, 120),
        size_bytes: file.size || 0,
        url: `/api/reports/photo-file/${encodeURIComponent(file.filename)}`,
      });
    }
  });
  try {
    save();
  } catch (error) {
    removeUploadedFiles(files);
    throw error;
  }
  return rows;
}

export function listReportPhotos(reportId) {
  return db.prepare(`
    SELECT id, report_id, stored_name, original_name, mime_type, size_bytes, created_at
    FROM report_photos WHERE report_id = ? ORDER BY id
  `).all(reportId).map((row) => ({
    ...row,
    url: `/api/reports/photo-file/${encodeURIComponent(row.stored_name)}`,
  }));
}

export function deleteReportPhotos(reportId) {
  const rows = db.prepare("SELECT stored_name FROM report_photos WHERE report_id = ?").all(reportId);
  db.prepare("DELETE FROM report_photos WHERE report_id = ?").run(reportId);
  for (const row of rows) {
    try { unlinkSync(join(REPORT_PHOTOS_DIR, row.stored_name)); } catch { /* best effort */ }
  }
}

export function resolveReportPhotoPath(storedName) {
  const safe = basename(String(storedName || ""));
  if (!safe || safe !== storedName || safe.includes("..")) {
    throw new ApiError(400, "INVALID_PHOTO", "Invalid photo reference.");
  }
  const path = join(REPORT_PHOTOS_DIR, safe);
  if (!existsSync(path)) throw new ApiError(404, "NOT_FOUND", "Photo not found.");
  const row = db.prepare("SELECT * FROM report_photos WHERE stored_name = ?").get(safe);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Photo not found.");
  return { path, row, stream: createReadStream(path) };
}

export function withReportPhotoUpload(handler) {
  return (req, res, next) => {
    reportPhotoUpload(req, res, (error) => {
      if (error) {
        if (error instanceof ApiError) return next(error);
        if (error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
          return next(new ApiError(400, "PHOTOS_TOO_LARGE", "Photos must total 27MB or less."));
        }
        return next(new ApiError(400, "UPLOAD", error.message || "Could not upload photos."));
      }
      Promise.resolve(handler(req, res, next)).catch(next);
    });
  };
}
