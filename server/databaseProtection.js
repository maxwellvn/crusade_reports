import Database from "better-sqlite3";
import { copyFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { db } from "./db.js";
import { logger } from "./logger.js";

const DEFAULT_RETENTION = { hourly: 2, daily: 0, weekly: 0 };
let activeBackup = null;
let timer = null;
let status = { state: "starting", last_success_at: null, last_error: null, latest_file: null, latest_bytes: 0 };

const positiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const registrationBackupIntervalMs = () => positiveInt(
  process.env.DB_REGISTRATION_BACKUP_MIN_INTERVAL_MINUTES,
  60,
) * 60 * 1000;

export function shouldThrottleBackup({ reason, lastSuccessAt, now = Date.now(), intervalMs = registrationBackupIntervalMs() }) {
  if (reason !== "registration" || !lastSuccessAt) return false;
  const elapsed = Number(now) - Date.parse(lastSuccessAt);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < intervalMs;
}

export const backupDirectory = () => resolve(process.env.DB_BACKUP_DIR || join(dirname(db.name), "backups"));
export const pendingRestorePath = () => join(dirname(db.name), ".restore-pending.sqlite");

export function assertPersistentDatabasePath(databasePath, persistentRoot) {
  if (!databasePath || !persistentRoot) throw new Error("Database persistent path configuration is incomplete.");
  const root = resolve(persistentRoot);
  const target = resolve(databasePath);
  const child = relative(root, target);
  if (!child || child.startsWith("..") || isAbsolute(child)) {
    if (!child) return target;
    throw new Error(`Database path must be inside persistent storage (${root}).`);
  }
  return target;
}

export function verifyDatabaseFile(path) {
  let snapshot;
  try {
    snapshot = new Database(path, { readonly: true, fileMustExist: true });
    const result = snapshot.pragma("quick_check", { simple: true });
    if (result !== "ok") throw new Error(`SQLite integrity check returned: ${result}`);
    return { ok: true, result };
  } catch (error) {
    throw new Error(`SQLite backup integrity verification failed: ${error.message}`, { cause: error });
  } finally {
    snapshot?.close();
  }
}

function timestampFromName(name) {
  const match = name.match(/^reports-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-/);
  return match ? Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`) : NaN;
}

export async function pruneBackups(dir, options = {}) {
  const policy = { ...DEFAULT_RETENTION, ...options };
  const names = (await readdir(dir)).filter((name) => name.startsWith("reports-") && name.endsWith(".sqlite"));
  const ordered = names.map((name) => ({ name, time: timestampFromName(name) }))
    .filter((item) => Number.isFinite(item.time)).sort((a, b) => b.time - a.time);
  const kept = new Set(ordered.slice(0, policy.hourly).map((item) => item.name));
  const dailyBuckets = new Set();
  const weeklyBuckets = new Set();
  for (const item of ordered.filter((entry) => !kept.has(entry.name))) {
    const instant = new Date(item.time);
    const day = instant.toISOString().slice(0, 10);
    const week = `${instant.getUTCFullYear()}-${Math.floor((item.time - Date.UTC(instant.getUTCFullYear(), 0, 1)) / (7 * 86400000))}`;
    if (dailyBuckets.size < policy.daily && !dailyBuckets.has(day)) {
      dailyBuckets.add(day);
      kept.add(item.name);
    } else if (weeklyBuckets.size < policy.weekly && !weeklyBuckets.has(week)) {
      weeklyBuckets.add(week);
      kept.add(item.name);
    }
  }
  for (const item of ordered) if (!kept.has(item.name)) await unlink(join(dir, item.name));
  return { kept: [...kept], removed: ordered.map((item) => item.name).filter((name) => !kept.has(name)) };
}

export async function createVerifiedBackup({ database = db, backupDir = backupDirectory(), mirrorDir, reason = "scheduled" } = {}) {
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `reports-${stamp}-${randomBytes(3).toString("hex")}.sqlite`;
  const finalPath = join(backupDir, name);
  const temporaryPath = `${finalPath}.tmp`;
  try {
    await database.backup(temporaryPath);
    verifyDatabaseFile(temporaryPath);
    await rename(temporaryPath, finalPath);
    const details = await stat(finalPath);
    if (mirrorDir) {
      await mkdir(mirrorDir, { recursive: true });
      const mirrorTemp = join(mirrorDir, `${name}.tmp`);
      await copyFile(finalPath, mirrorTemp);
      verifyDatabaseFile(mirrorTemp);
      await rename(mirrorTemp, join(mirrorDir, name));
    }
    return { path: finalPath, name, bytes: details.size, reason };
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

export function backupDatabase(reason = "automatic") {
  if (activeBackup) return activeBackup;
  if (shouldThrottleBackup({ reason, lastSuccessAt: status.last_success_at })) {
    return Promise.resolve({ skipped: true, reason, last_success_at: status.last_success_at });
  }
  activeBackup = (async () => {
    try {
      const result = await createVerifiedBackup({
        reason,
        mirrorDir: process.env.DB_BACKUP_MIRROR_DIR ? resolve(process.env.DB_BACKUP_MIRROR_DIR) : undefined,
      });
      await pruneBackups(backupDirectory(), {
        hourly: positiveInt(process.env.DB_BACKUP_KEEP_HOURLY, DEFAULT_RETENTION.hourly),
        daily: positiveInt(process.env.DB_BACKUP_KEEP_DAILY, DEFAULT_RETENTION.daily),
        weekly: positiveInt(process.env.DB_BACKUP_KEEP_WEEKLY, DEFAULT_RETENTION.weekly),
      });
      if (process.env.DB_BACKUP_MIRROR_DIR) {
        await pruneBackups(resolve(process.env.DB_BACKUP_MIRROR_DIR), {
          hourly: positiveInt(process.env.DB_BACKUP_KEEP_HOURLY, DEFAULT_RETENTION.hourly),
          daily: positiveInt(process.env.DB_BACKUP_KEEP_DAILY, DEFAULT_RETENTION.daily),
          weekly: positiveInt(process.env.DB_BACKUP_KEEP_WEEKLY, DEFAULT_RETENTION.weekly),
        });
      }
      status = { state: "protected", last_success_at: new Date().toISOString(), last_error: null, latest_file: result.name, latest_bytes: result.bytes };
      logger.info({ backup: result.name, bytes: result.bytes, reason }, "verified database backup created");
      return result;
    } catch (error) {
      status = { ...status, state: "error", last_error: error.message };
      logger.error({ err: error, reason }, "database backup failed");
      throw error;
    } finally {
      activeBackup = null;
    }
  })();
  return activeBackup;
}

export function databaseProtectionStatus() {
  return { ...status, retention: DEFAULT_RETENTION, mirror_configured: Boolean(process.env.DB_BACKUP_MIRROR_DIR) };
}

export async function stageDatabaseRestore(uploadedPath) {
  verifyDatabaseFile(uploadedPath);
  await backupDatabase("pre-restore-safety");
  const pending = pendingRestorePath();
  const temporary = `${pending}.tmp`;
  await copyFile(uploadedPath, temporary);
  verifyDatabaseFile(temporary);
  await rename(temporary, pending);
  return { pending };
}

export async function startDatabaseProtection() {
  if (process.env.DB_REQUIRE_PERSISTENT_STORAGE === "1") {
    assertPersistentDatabasePath(db.name, process.env.DB_PERSISTENT_ROOT || "/app/data");
  }
  verifyDatabaseFile(db.name);
  await backupDatabase("startup");
  const minutes = positiveInt(process.env.DB_BACKUP_INTERVAL_MINUTES, 60);
  timer = setInterval(() => backupDatabase("scheduled").catch(() => {}), minutes * 60 * 1000);
  timer.unref();
}

export function stopDatabaseProtection() {
  if (timer) clearInterval(timer);
  timer = null;
}
