import { db } from "./db.js";
import { ApiError } from "./logger.js";

export const MYSTREAMSPACE_MANUAL_KEYS = {
  crusades: "mystreamspace_manual_crusades",
  online_attendance: "mystreamspace_manual_online_attendance",
  updated_at: "mystreamspace_manual_updated_at",
};

const aggregateRow = (key, crusades, onlineAttendance) => ({
  key,
  crusades,
  attendance: 0,
  online_attendance: onlineAttendance,
  salvation: 0,
});

const safeWholeNumber = (value) => {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

export function normalizeMyStreamSpaceAdjustment(value = {}) {
  const crusades = safeWholeNumber(value.crusades);
  const onlineAttendance = safeWholeNumber(value.online_attendance);
  if (crusades == null || onlineAttendance == null) {
    throw new ApiError(422, "VALIDATION", "MyStreamSpace values must be non-negative whole numbers.");
  }
  return { crusades, online_attendance: onlineAttendance };
}

export function getManualMyStreamSpaceAdjustment(database = db) {
  const rows = database.prepare(
    "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)"
  ).all(...Object.values(MYSTREAMSPACE_MANUAL_KEYS));
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    crusades: safeWholeNumber(values[MYSTREAMSPACE_MANUAL_KEYS.crusades]) || 0,
    online_attendance: safeWholeNumber(values[MYSTREAMSPACE_MANUAL_KEYS.online_attendance]) || 0,
    updated_at: values[MYSTREAMSPACE_MANUAL_KEYS.updated_at] || null,
  };
}

export function setManualMyStreamSpaceAdjustment(value, database = db) {
  const adjustment = normalizeMyStreamSpaceAdjustment(value);
  const updatedAt = new Date().toISOString();
  const save = database.transaction(() => {
    const statement = database.prepare(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    statement.run(MYSTREAMSPACE_MANUAL_KEYS.crusades, String(adjustment.crusades));
    statement.run(MYSTREAMSPACE_MANUAL_KEYS.online_attendance, String(adjustment.online_attendance));
    statement.run(MYSTREAMSPACE_MANUAL_KEYS.updated_at, updatedAt);
  });
  save();
  return { ...adjustment, updated_at: updatedAt };
}

export function combineMyStreamSpaceTotals(existing, manual) {
  const normalizedExisting = {
    crusades: Number(existing?.crusades) || 0,
    online_attendance: Number(existing?.online_attendance) || 0,
  };
  const normalizedManual = {
    crusades: Number(manual?.crusades) || 0,
    online_attendance: Number(manual?.online_attendance) || 0,
  };
  return {
    existing: normalizedExisting,
    manual: normalizedManual,
    totals: {
      crusades: normalizedExisting.crusades + normalizedManual.crusades,
      online_attendance: normalizedExisting.online_attendance + normalizedManual.online_attendance,
    },
  };
}

function adjustedBreakdown(rows = [], key, adjustment) {
  const next = rows.map((row) => ({ ...row }));
  const row = next.find((item) => item.key === key);
  if (row) {
    row.crusades = (Number(row.crusades) || 0) + adjustment.crusades;
    row.online_attendance = (Number(row.online_attendance) || 0) + adjustment.online_attendance;
  } else {
    next.push(aggregateRow(key, adjustment.crusades, adjustment.online_attendance));
  }
  return next;
}

export function applyMyStreamSpaceAdjustment(data, value) {
  const adjustment = normalizeMyStreamSpaceAdjustment(value);
  return {
    ...data,
    totals: {
      ...data.totals,
      crusades: (Number(data.totals?.crusades) || 0) + adjustment.crusades,
      online_participation: (Number(data.totals?.online_participation) || 0) + adjustment.online_attendance,
    },
    by_category: adjustedBreakdown(data.by_category, "mystreamspace", adjustment),
    by_format: adjustedBreakdown(data.by_format, "online", adjustment),
    mystreamspace_manual_adjustment: adjustment,
  };
}

export function getMyStreamSpacePublicStats(database = db) {
  const existing = database.prepare(
    `SELECT COUNT(*) AS crusades,
            COALESCE(SUM(online_participation), 0) AS online_attendance
     FROM crusades WHERE event_type = 'mystreamspace'`
  ).get();
  const manual = getManualMyStreamSpaceAdjustment(database);
  return { ...combineMyStreamSpaceTotals(existing, manual), updated_at: manual.updated_at };
}
