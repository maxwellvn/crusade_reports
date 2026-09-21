import multer from "multer";
import { randomUUID } from "node:crypto";
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readSync, renameSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { db } from "./db.js";
import { ApiError } from "./logger.js";

// Receipts and pictorial evidence for zonal crusade expense reports. Same
// shape as report photos, plus PDF for receipts.
export const EVIDENCE_DIR = process.env.EXPENSE_EVIDENCE_DIR || join(dirname(new URL(import.meta.url).pathname), "..", "data", "expense-evidence");
export const MAX_EVIDENCE_BYTES = 40 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 30;
if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

export function detectEvidenceType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: ".jpg", mime: "image/jpeg" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { extension: ".png", mime: "image/png" };
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return { extension: ".gif", mime: "image/gif" };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return { extension: ".webp", mime: "image/webp" };
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return { extension: ".pdf", mime: "application/pdf" };
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return { extension: ".heic", mime: "image/heic" };
    if (["mif1", "msf1"].includes(brand)) return { extension: ".heif", mime: "image/heif" };
  }
  return null;
}

// Count bytes as they stream in so one request cannot exceed the documented
// allowance before the size check runs.
const storage = {
  _handleFile(req, file, cb) {
    const filename = `${randomUUID()}.upload`;
    const path = join(EVIDENCE_DIR, filename);
    const output = createWriteStream(path);
    let size = 0;
    let done = (error, result) => { done = () => {}; cb(error, result); };
    file.stream.on("data", (chunk) => {
      size += chunk.length;
      req.evidenceUploadBytes = (req.evidenceUploadBytes || 0) + chunk.length;
      if (req.evidenceUploadBytes > MAX_EVIDENCE_BYTES) {
        file.stream.unpipe(output);
        output.destroy();
        unlinkSync(path);
        file.stream.resume();
        done(new ApiError(400, "EVIDENCE_TOO_LARGE", `Evidence must total ${Math.round(MAX_EVIDENCE_BYTES / (1024 * 1024))}MB or less.`));
      }
    });
    output.on("error", (error) => done(error));
    output.on("finish", () => done(null, { destination: EVIDENCE_DIR, filename, path, size }));
    file.stream.pipe(output);
  },
  _removeFile(_req, file, cb) { if (file.path) unlinkSync(file.path); cb(null); },
};

export const evidenceUpload = multer({ storage, limits: { files: MAX_EVIDENCE_FILES } }).any();

export function removeUploadedFiles(files) {
  for (const file of files || []) { try { if (file.path && existsSync(file.path)) unlinkSync(file.path); } catch { /* already gone */ } }
}

// Trust the bytes, not the declared mime type.
export function verifyUploadedEvidence(files = []) {
  if (files.length > MAX_EVIDENCE_FILES) {
    removeUploadedFiles(files);
    throw new ApiError(400, "TOO_MANY_FILES", `You can upload up to ${MAX_EVIDENCE_FILES} evidence files per report.`);
  }
  for (const file of files) {
    const descriptor = openSync(file.path, "r");
    const header = Buffer.alloc(16);
    const bytes = readSync(descriptor, header, 0, header.length, 0);
    closeSync(descriptor);
    const detected = detectEvidenceType(header.subarray(0, bytes));
    if (!detected) {
      removeUploadedFiles(files);
      throw new ApiError(400, "INVALID_EVIDENCE", "Upload photos (JPEG, PNG, WebP, GIF, HEIC) or PDF receipts only.");
    }
    const filename = `${basename(file.filename, ".upload")}${detected.extension}`;
    renameSync(file.path, join(EVIDENCE_DIR, filename));
    Object.assign(file, { filename, path: join(EVIDENCE_DIR, filename), mimetype: detected.mime });
  }
}

const insertEvidence = db.prepare("INSERT INTO zone_expense_evidence (crusade_id, stored_name, original_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)");
export function saveEvidence(crusadeId, files = []) {
  for (const file of files) {
    insertEvidence.run(crusadeId, file.filename, String(file.originalname || file.filename).slice(0, 255), String(file.mimetype || "application/octet-stream").slice(0, 120), file.size || 0);
  }
}

export const evidenceFor = (crusadeId) => db.prepare("SELECT id, stored_name, original_name, mime_type, size_bytes FROM zone_expense_evidence WHERE crusade_id = ? ORDER BY id").all(crusadeId)
  .map((row) => ({ ...row, url: `/api/crusade-expenses/evidence/${encodeURIComponent(row.stored_name)}` }));

// Reject traversal and any name the caller invented rather than one we stored.
export function resolveEvidencePath(storedName) {
  const safe = basename(String(storedName || ""));
  if (!safe || safe !== storedName || safe.includes("..")) throw new ApiError(400, "INVALID_FILE", "Invalid evidence file.");
  const known = db.prepare("SELECT 1 FROM zone_expense_evidence WHERE stored_name = ?").get(safe);
  if (!known) throw new ApiError(404, "NOT_FOUND", "Evidence file not found.");
  const path = join(EVIDENCE_DIR, safe);
  if (!existsSync(path)) throw new ApiError(404, "NOT_FOUND", "Evidence file not found.");
  return path;
}

export function deleteEvidenceByNames(storedNames = []) {
  for (const name of storedNames) {
    try { const path = join(EVIDENCE_DIR, basename(String(name))); if (existsSync(path)) unlinkSync(path); } catch { /* already gone */ }
  }
}

export function deleteEvidenceFiles(crusadeIds = []) {
  for (const crusadeId of crusadeIds) {
    for (const row of db.prepare("SELECT stored_name FROM zone_expense_evidence WHERE crusade_id = ?").all(crusadeId)) {
      try { const path = join(EVIDENCE_DIR, row.stored_name); if (existsSync(path)) unlinkSync(path); } catch { /* already gone */ }
    }
  }
}
