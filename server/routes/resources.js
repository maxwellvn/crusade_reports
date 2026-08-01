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
  const imageSrc = html.match(/<link\s+[^>]*rel=["'](?:image_src|apple-touch-icon)["'][^>]*>/i)?.[0];
  const href = imageSrc?.match(/href=["']([^"']+)["']/i)?.[1];
  if (href) { try { return new URL(href, baseUrl).href; } catch { /* malformed link */ } }
  const jsonThumbnail = html.match(/["'](?:thumbnailUrl|thumbnail_url)["']\s*:\s*["']([^"']+)["']/i)?.[1];
  if (jsonThumbnail) { try { return new URL(jsonThumbnail.replace(/\\\//g, "/"), baseUrl).href; } catch { /* malformed JSON-LD */ } }
  return null;
}

export async function discoverThumbnail(value) {
  try {
    let url = await assertPublicUrl(value);
    const youtube = youtubeThumbnail(url);
    if (youtube) return youtube;
    for (let redirects = 0; redirects < 4; redirects += 1) {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { Accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/*,*/*;q=0.7", "User-Agent": "Mozilla/5.0 (compatible; NOTCResourcePreview/1.0; +https://rhapsodycrusades.org)" } });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        url = await assertPublicUrl(new URL(response.headers.get("location"), url).href);
        continue;
      }
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) return null;
      if (contentType.startsWith("image/")) return url.href;
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;
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

resources.post("/", requireSuperAdmin, upload.fields([{ name: "file", maxCount: 1 }, { name: "thumbnail", maxCount: 1 }]), wrap(async (req, res) => {
  const file = req.files?.file?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0];
  try {
    const title = clean(req.body.title, 160);
    const description = clean(req.body.description, 2000);
    const category = clean(req.body.category, 80);
    const externalUrl = clean(req.body.external_url, 2000);
    const suppliedThumbnail = clean(req.body.thumbnail_url, 2000);
    let type = clean(req.body.resource_type, 20).toLowerCase();
    if (!title) throw new ApiError(400, "TITLE_REQUIRED", "Please enter a resource title.");
    if (!db.prepare("SELECT 1 FROM resource_categories WHERE name = ? COLLATE NOCASE").get(category)) {
      throw new ApiError(400, "INVALID_CATEGORY", "Choose one of the available resource categories.");
    }
    if (!ALLOWED_TYPES.has(type)) throw new ApiError(400, "INVALID_TYPE", "Choose a valid resource type.");
    if (!file && !externalUrl) throw new ApiError(400, "RESOURCE_REQUIRED", "Upload a file or add a web link.");
    if (file && externalUrl) throw new ApiError(400, "ONE_SOURCE_ONLY", "Use either a file or a web link, not both.");
    if (thumbnailFile && (!thumbnailFile.mimetype.startsWith("image/") || thumbnailFile.size > 8 * 1024 * 1024)) throw new ApiError(400, "INVALID_THUMBNAIL_FILE", "Choose a thumbnail image no larger than 8 MB.");
    if (externalUrl && !validHttpUrl(externalUrl)) throw new ApiError(400, "INVALID_URL", "The link must start with http:// or https://.");
    if (suppliedThumbnail && (!externalUrl || !validHttpUrl(suppliedThumbnail))) throw new ApiError(400, "INVALID_THUMBNAIL", "The thumbnail must be a valid web image URL.");
    // Documents and generic files do not need a remote preview lookup. Avoid
    // making an upload wait on a third-party site (or a slow DNS response).
    let thumbnailUrl = externalUrl && !["document", "audio", "other"].includes(type)
      ? await discoverThumbnail(externalUrl)
      : null;
    if (thumbnailFile) thumbnailUrl = `/resource-files/${encodeURIComponent(thumbnailFile.filename)}`;
    if (suppliedThumbnail && !thumbnailFile) {
      try { thumbnailUrl = (await assertPublicUrl(suppliedThumbnail)).href; }
      catch { throw new ApiError(400, "INVALID_THUMBNAIL", "Use a publicly accessible thumbnail image URL."); }
    }
    const result = db.prepare(`INSERT INTO resources
      (title, description, category, resource_type, external_url, thumbnail_url, stored_name, original_name, mime_type, file_size, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(title, description || null, category, type, externalUrl || null, thumbnailUrl, file?.filename || null,
        file?.originalname || null, file?.mimetype || null, file?.size || null, req.admin.username);
    res.status(201).json(publicRow(db.prepare("SELECT * FROM resources WHERE id = ?").get(result.lastInsertRowid)));
  } catch (error) {
    // Multer writes before field validation; remove rejected uploads immediately.
    for (const uploaded of [file, thumbnailFile]) if (uploaded?.filename) { try { unlinkSync(join(RESOURCE_FILES_DIR, uploaded.filename)); } catch { /* best effort */ } }
    throw error;
  }
}));

resources.put("/:id", requireSuperAdmin, upload.single("thumbnail"), wrap(async (req, res) => {
  const row = db.prepare("SELECT * FROM resources WHERE id = ?").get(req.params.id);
  if (!row) { if (req.file?.filename) unlinkSync(join(RESOURCE_FILES_DIR, req.file.filename)); throw new ApiError(404, "NOT_FOUND", "Resource not found."); }
  try {
    const title = clean(req.body.title, 160); const description = clean(req.body.description, 2000); const category = clean(req.body.category, 80);
    const type = clean(req.body.resource_type, 20).toLowerCase(); const requestedUrl = clean(req.body.external_url, 2000); const suppliedThumbnail = clean(req.body.thumbnail_url, 2000);
    if (!title) throw new ApiError(400, "TITLE_REQUIRED", "Please enter a resource title.");
    if (!ALLOWED_TYPES.has(type)) throw new ApiError(400, "INVALID_TYPE", "Choose a valid resource type.");
    if (!db.prepare("SELECT 1 FROM resource_categories WHERE name = ? COLLATE NOCASE").get(category)) throw new ApiError(400, "INVALID_CATEGORY", "Choose one of the available resource categories.");
    if (row.external_url && !validHttpUrl(requestedUrl)) throw new ApiError(400, "INVALID_URL", "The link must start with http:// or https://.");
    if (!row.external_url && requestedUrl) throw new ApiError(400, "SOURCE_LOCKED", "An uploaded resource cannot be changed into a link.");
    if (req.file && (!req.file.mimetype.startsWith("image/") || req.file.size > 8 * 1024 * 1024)) throw new ApiError(400, "INVALID_THUMBNAIL_FILE", "Choose a thumbnail image no larger than 8 MB.");
    let thumbnailUrl = row.thumbnail_url;
    if (row.external_url && requestedUrl !== row.external_url && !req.file && !suppliedThumbnail) thumbnailUrl = await discoverThumbnail(requestedUrl);
    if (suppliedThumbnail && !req.file) { try { thumbnailUrl = (await assertPublicUrl(suppliedThumbnail)).href; } catch { throw new ApiError(400, "INVALID_THUMBNAIL", "Use a publicly accessible thumbnail image URL."); } }
    if (req.file) thumbnailUrl = `/resource-files/${encodeURIComponent(req.file.filename)}`;
    db.prepare("UPDATE resources SET title = ?, description = ?, category = ?, resource_type = ?, external_url = ?, thumbnail_url = ?, updated_at = datetime('now') WHERE id = ?")
      .run(title, description || null, category, type, row.external_url ? requestedUrl : null, thumbnailUrl, row.id);
    if (thumbnailUrl !== row.thumbnail_url && row.thumbnail_url?.startsWith("/resource-files/")) { try { unlinkSync(join(RESOURCE_FILES_DIR, decodeURIComponent(row.thumbnail_url.slice(16)))); } catch { /* best effort */ } }
    res.json(publicRow(db.prepare("SELECT * FROM resources WHERE id = ?").get(row.id)));
  } catch (error) { if (req.file?.filename) { try { unlinkSync(join(RESOURCE_FILES_DIR, req.file.filename)); } catch { /* best effort */ } } throw error; }
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
  if (row.thumbnail_url?.startsWith("/resource-files/")) {
    const thumbnailName = decodeURIComponent(row.thumbnail_url.slice("/resource-files/".length));
    try { unlinkSync(join(RESOURCE_FILES_DIR, thumbnailName)); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  res.status(204).end();
}));
