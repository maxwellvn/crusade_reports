import multer from "multer";
import { mkdirSync, unlinkSync, createReadStream, createWriteStream, existsSync, openSync, readSync, closeSync, renameSync } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { db } from "./db.js";
import { ApiError } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPORT_PHOTOS_DIR = join(__dirname, "..", "data", "report-photos");
mkdirSync(REPORT_PHOTOS_DIR, { recursive: true });

export const MAX_REPORT_PHOTOS_BYTES = 50 * 1024 * 1024;
export const MAX_REPORT_PHOTO_FILES = 40;
const MAX_REPORT_PHOTOS_MB = Math.round(MAX_REPORT_PHOTOS_BYTES / (1024 * 1024));

function photosTooLargeMessage() {
  return `Photos must total ${MAX_REPORT_PHOTOS_MB}MB or less. Remove some photos or share larger albums with photo links instead.`;
}

function tooManyPhotosMessage() {
  return `You can upload up to ${MAX_REPORT_PHOTO_FILES} photos per report. Remove some and try again.`;
}

export function detectPhotoType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: ".jpg", mime: "image/jpeg" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { extension: ".png", mime: "image/png" };
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return { extension: ".gif", mime: "image/gif" };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return { extension: ".webp", mime: "image/webp" };
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return { extension: ".heic", mime: "image/heic" };
    if (["mif1", "msf1"].includes(brand)) return { extension: ".heif", mime: "image/heif" };
  }
  return null;
}

// Count bytes while streams are being written so one multipart request cannot
// temporarily consume 40 times the documented combined upload allowance.
const storage = {
  _handleFile(req, file, cb) {
    const filename = `${randomUUID()}.upload`;
    const path = join(REPORT_PHOTOS_DIR, filename);
    const output = createWriteStream(path, { flags: "wx" });
    let size = 0;
    let finished = false;
    const done = (error, result) => {
      if (finished) return;
      finished = true;
      if (error) { try { unlinkSync(path); } catch { /* best effort */ } }
      cb(error, result);
    };
    file.stream.on("data", (chunk) => {
      size += chunk.length;
      req.reportPhotoUploadBytes = (req.reportPhotoUploadBytes || 0) + chunk.length;
      if (req.reportPhotoUploadBytes > MAX_REPORT_PHOTOS_BYTES) {
        const error = new ApiError(400, "PHOTOS_TOO_LARGE", photosTooLargeMessage());
        file.stream.unpipe(output);
        output.destroy(error);
        file.stream.resume();
      }
    });
    output.on("error", (error) => done(error));
    output.on("finish", () => done(null, { destination: REPORT_PHOTOS_DIR, filename, path, size }));
    file.stream.pipe(output);
  },
  _removeFile(_req, file, cb) {
    if (!file.path) return cb(null);
    unlinkSync(file.path);
    cb(null);
  },
};

function verifyUploadedPhotos(files = []) {
  for (const file of files) {
    const descriptor = openSync(file.path, "r");
    const header = Buffer.alloc(16);
    const bytes = readSync(descriptor, header, 0, header.length, 0);
    closeSync(descriptor);
    const detected = detectPhotoType(header.subarray(0, bytes));
    if (!detected) {
      removeUploadedFiles(files);
      throw new ApiError(400, "INVALID_PHOTO", "Only genuine JPEG, PNG, WebP, GIF, HEIC, or HEIF image files can be uploaded.");
    }
    const filename = `${basename(file.filename, ".upload")}${detected.extension}`;
    const path = join(REPORT_PHOTOS_DIR, filename);
    renameSync(file.path, path);
    Object.assign(file, { filename, path, mimetype: detected.mime });
  }
}

export const reportPhotoUpload = multer({
  storage,
  limits: { files: MAX_REPORT_PHOTO_FILES },
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
  if (files.length > MAX_REPORT_PHOTO_FILES) {
    removeUploadedFiles(files);
    throw new ApiError(400, "TOO_MANY_PHOTOS", tooManyPhotosMessage());
  }
  const total = files.reduce((sum, file) => sum + (file.size || 0), 0);
  if (total > MAX_REPORT_PHOTOS_BYTES) {
    removeUploadedFiles(files);
    throw new ApiError(400, "PHOTOS_TOO_LARGE", photosTooLargeMessage());
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
  const descriptor = openSync(path, "r");
  const header = Buffer.alloc(16);
  const bytes = readSync(descriptor, header, 0, header.length, 0);
  closeSync(descriptor);
  const detected = detectPhotoType(header.subarray(0, bytes));
  if (!detected) throw new ApiError(415, "INVALID_PHOTO", "This stored file is not a supported image.");
  row.mime_type = detected.mime;
  return { path, row, stream: createReadStream(path) };
}

export function withReportPhotoUpload(handler) {
  return (req, res, next) => {
    reportPhotoUpload(req, res, (error) => {
      if (error) {
        removeUploadedFiles(req.files);
        if (error instanceof ApiError) return next(error);
        if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
          return next(new ApiError(400, "TOO_MANY_PHOTOS", tooManyPhotosMessage()));
        }
        if (error.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "PHOTOS_TOO_LARGE", photosTooLargeMessage()));
        }
        return next(new ApiError(400, "UPLOAD", "Could not upload photos. Check that each file is an image and the total is within the limit, then try again."));
      }
      try { verifyUploadedPhotos(req.files); } catch (verificationError) { return next(verificationError); }
      Promise.resolve(handler(req, res, next)).catch(next);
    });
  };
}
