import { createHash, randomBytes } from "node:crypto";

const TOKEN_HASH_KEY = "mystreamspace_update_token_hash";
const TOKEN_CREATED_AT_KEY = "mystreamspace_update_token_created_at";

const tokenHash = (token) => createHash("sha256").update(String(token || "")).digest("hex");

function saveSetting(database, key, value) {
  database.prepare(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function createMyStreamSpaceUpdateToken(database) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date().toISOString();
  database.transaction(() => {
    saveSetting(database, TOKEN_HASH_KEY, tokenHash(token));
    saveSetting(database, TOKEN_CREATED_AT_KEY, createdAt);
  })();
  return { token, created_at: createdAt };
}

export function getMyStreamSpaceUpdateTokenStatus(database) {
  const rows = database.prepare(
    "SELECT key, value FROM app_settings WHERE key IN (?, ?)"
  ).all(TOKEN_HASH_KEY, TOKEN_CREATED_AT_KEY);
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const active = Boolean(values[TOKEN_HASH_KEY]);
  return {
    active,
    created_at: active ? values[TOKEN_CREATED_AT_KEY] || null : null,
  };
}

export function isValidMyStreamSpaceUpdateToken(token, database) {
  const normalized = String(token || "").trim();
  if (!normalized) return false;
  const stored = database.prepare("SELECT value FROM app_settings WHERE key = ?").get(TOKEN_HASH_KEY)?.value;
  return Boolean(stored) && stored === tokenHash(normalized);
}

export function revokeMyStreamSpaceUpdateToken(database) {
  database.prepare("DELETE FROM app_settings WHERE key IN (?, ?)").run(TOKEN_HASH_KEY, TOKEN_CREATED_AT_KEY);
}
