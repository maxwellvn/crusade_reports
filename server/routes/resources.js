import { Router } from "express";
import multer from "multer";
import { mkdirSync, unlinkSync } from "node:fs";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { db } from "../db.js";
import { requireSuperAdmin } from "../auth.js";
import { ApiError, wrap } from "../logger.js";

export const resources = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
export const RESOURCE_FILES_DIR = join(__dirname, "..", "..", "data", "resource-files");
mkdirSync(RESOURCE_FILES_DIR, { recursive: true });

const ALLOWED_TYPES = new Set(["link", "image", "video", "document", "audio", "other"]);
const storage = multer.diskStorage({
  destination: RESOURCE_FILES_DIR,
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 12)}`),
});
const upload = multer({ storage, limits: { fileSize: 150 * 1024 * 1024, files: 1 } });

const clean = (value, max = 500) => String(value || "").trim().slice(0, max);
const publicRow = (row) => ({
  ...row,
  url: row.external_url || `/resource-files/${encodeURIComponent(row.stored_name)}`,
  is_external: Boolean(row.external_url),
});

function validHttpUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

// Public, searchable catalogue. Parameterized LIKE queries prevent injection.
resources.get("/", wrap((req, res) => {
  const q = clean(req.query.q, 100);
  const type = clean(req.query.type, 20);
  const category = clean(req.query.category, 80);
  const where = [];
  const params = [];
  if (q) { where.push("(title LIKE ? OR description LIKE ? OR category LIKE ?)"); params.push(...Array(3).fill(`%${q}%`)); }
  if (type && ALLOWED_TYPES.has(type)) { where.push("resource_type = ?"); params.push(type); }
  if (category) { where.push("category = ? COLLATE NOCASE"); params.push(category); }
  const rows = db.prepare(`SELECT * FROM resources ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC`).all(...params);
  const categories = db.prepare(`SELECT c.id, c.name, COUNT(r.id) AS resource_count
    FROM resource_categories c LEFT JOIN resources r ON r.category = c.name COLLATE NOCASE
    GROUP BY c.id ORDER BY c.name COLLATE NOCASE`).all();
  res.json({ resources: rows.map(publicRow), categories });
}));

resources.post("/categories", requireSuperAdmin, wrap((req, res) => {
  const name = clean(req.body.name, 80).replace(/\s+/g, " ");
  if (name.length < 2) throw new ApiError(400, "INVALID_CATEGORY", "Category names must be at least 2 characters.");
  try {
    const result = db.prepare("INSERT INTO resource_categories (name) VALUES (?)").run(name);
    res.status(201).json(db.prepare("SELECT id, name, 0 AS resource_count FROM resource_categories WHERE id = ?").get(result.lastInsertRowid));
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") throw new ApiError(409, "CATEGORY_EXISTS", "That category already exists.");
    throw error;
  }
}));

resources.delete("/categories/:id", requireSuperAdmin, wrap((req, res) => {
  const category = db.prepare("SELECT * FROM resource_categories WHERE id = ?").get(req.params.id);
  if (!category) throw new ApiError(404, "NOT_FOUND", "Category not found.");
  const used = db.prepare("SELECT COUNT(*) AS count FROM resources WHERE category = ? COLLATE NOCASE").get(category.name).count;
  if (used) throw new ApiError(409, "CATEGORY_IN_USE", `Move or delete the ${used} resource${used === 1 ? "" : "s"} in this category first.`);
  db.prepare("DELETE FROM resource_categories WHERE id = ?").run(category.id);
  res.status(204).end();
}));

resources.post("/", requireSuperAdmin, upload.single("file"), wrap((req, res) => {
  try {
    const title = clean(req.body.title, 160);
    const description = clean(req.body.description, 2000);
    const category = clean(req.body.category, 80);
    const externalUrl = clean(req.body.external_url, 2000);
    let type = clean(req.body.resource_type, 20).toLowerCase();
    if (!title) throw new ApiError(400, "TITLE_REQUIRED", "Please enter a resource title.");
    if (!db.prepare("SELECT 1 FROM resource_categories WHERE name = ? COLLATE NOCASE").get(category)) {
      throw new ApiError(400, "INVALID_CATEGORY", "Choose one of the available resource categories.");
    }
    if (!ALLOWED_TYPES.has(type)) throw new ApiError(400, "INVALID_TYPE", "Choose a valid resource type.");
    if (!req.file && !externalUrl) throw new ApiError(400, "RESOURCE_REQUIRED", "Upload a file or add a web link.");
    if (req.file && externalUrl) throw new ApiError(400, "ONE_SOURCE_ONLY", "Use either a file or a web link, not both.");
    if (externalUrl && !validHttpUrl(externalUrl)) throw new ApiError(400, "INVALID_URL", "The link must start with http:// or https://.");
    if (externalUrl) type = "link";
    const result = db.prepare(`INSERT INTO resources
      (title, description, category, resource_type, external_url, stored_name, original_name, mime_type, file_size, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(title, description || null, category, type, externalUrl || null, req.file?.filename || null,
        req.file?.originalname || null, req.file?.mimetype || null, req.file?.size || null, req.admin.username);
    res.status(201).json(publicRow(db.prepare("SELECT * FROM resources WHERE id = ?").get(result.lastInsertRowid)));
  } catch (error) {
    // Multer writes before field validation; remove rejected uploads immediately.
    if (req.file?.filename) { try { unlinkSync(join(RESOURCE_FILES_DIR, req.file.filename)); } catch { /* best effort */ } }
    throw error;
  }
}));

resources.delete("/:id", requireSuperAdmin, wrap((req, res) => {
  const row = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  db.prepare("DELETE FROM resources WHERE id = ?").run(row.id);
  if (row.stored_name) {
    try { unlinkSync(join(RESOURCE_FILES_DIR, row.stored_name)); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  res.status(204).end();
}));
