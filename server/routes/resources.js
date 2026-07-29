import { Router } from "express";
import multer from "multer";
import { mkdirSync, unlinkSync } from "node:fs";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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

export function isPrivateAddress(address) {
  if (address === "::1" || address === "::" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd")) return true;
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const value = mapped || address;
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublicUrl(value) {
  const url = new URL(value);
  if (!validHttpUrl(value) || url.username || url.password || url.hostname.toLowerCase() === "localhost") throw new Error("Unsafe URL");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Unsafe URL");
  return url;
}

export function youtubeThumbnail(url) {
  const host = url.hostname.replace(/^www\./, "");
  let id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : null;
  if (["youtube.com", "m.youtube.com"].includes(host)) id = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/)?.[1];
  return /^[A-Za-z0-9_-]{6,20}$/.test(id || "") ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function metadataImage(html, baseUrl) {
  for (const tag of html.match(/<meta\s+[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/gi)].map((match) => [match[1].toLowerCase(), match[2]]));
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (["og:image", "og:image:url", "twitter:image", "twitter:image:src"].includes(key) && attrs.content) {
      try { return new URL(attrs.content, baseUrl).href; } catch { /* malformed metadata */ }
    }
  }
  return null;
}

async function discoverThumbnail(value) {
  try {
    let url = await assertPublicUrl(value);
    const youtube = youtubeThumbnail(url);
    if (youtube) return youtube;
    for (let redirects = 0; redirects < 4; redirects += 1) {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(6000), headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "NOTC-Resource-Preview/1.0" } });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        url = await assertPublicUrl(new URL(response.headers.get("location"), url).href);
        continue;
      }
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return null;
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      while (size < 512 * 1024) { const { done, value: chunk } = await reader.read(); if (done) break; chunks.push(chunk); size += chunk.length; }
      await reader.cancel().catch(() => {});
      const html = new TextDecoder().decode(Buffer.concat(chunks).subarray(0, 512 * 1024));
      const image = metadataImage(html, url);
      if (!image) return null;
      await assertPublicUrl(image);
      return image;
    }
  } catch { /* thumbnail discovery must never block publishing */ }
  return null;
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

resources.post("/", requireSuperAdmin, upload.single("file"), wrap(async (req, res) => {
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
    const thumbnailUrl = externalUrl ? await discoverThumbnail(externalUrl) : null;
    const result = db.prepare(`INSERT INTO resources
      (title, description, category, resource_type, external_url, thumbnail_url, stored_name, original_name, mime_type, file_size, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(title, description || null, category, type, externalUrl || null, thumbnailUrl, req.file?.filename || null,
        req.file?.originalname || null, req.file?.mimetype || null, req.file?.size || null, req.admin.username);
    res.status(201).json(publicRow(db.prepare("SELECT * FROM resources WHERE id = ?").get(result.lastInsertRowid)));
  } catch (error) {
    // Multer writes before field validation; remove rejected uploads immediately.
    if (req.file?.filename) { try { unlinkSync(join(RESOURCE_FILES_DIR, req.file.filename)); } catch { /* best effort */ } }
    throw error;
  }
}));

resources.post("/:id/thumbnail", requireSuperAdmin, wrap(async (req, res) => {
  const row = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!row) throw new ApiError(404, "NOT_FOUND", "Resource not found.");
  if (!row.external_url) throw new ApiError(400, "NOT_A_LINK", "Only linked resources can fetch a thumbnail.");
  const thumbnailUrl = await discoverThumbnail(row.external_url);
  if (!thumbnailUrl) throw new ApiError(422, "THUMBNAIL_NOT_FOUND", "This link does not provide a usable thumbnail.");
  db.prepare("UPDATE resources SET thumbnail_url = ?, updated_at = datetime('now') WHERE id = ?").run(thumbnailUrl, row.id);
  res.json(publicRow(db.prepare("SELECT * FROM resources WHERE id = ?").get(row.id)));
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
