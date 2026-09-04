import { db, METRIC_FIELDS } from "./db.js";
import { ApiError } from "./logger.js";
import { deleteReportPhotos } from "./reportMedia.js";

const DUPLICATE_REPORT_GROUPS = `
  WITH duplicate_groups AS (
    SELECT event_date,
           LOWER(TRIM(event_name)) AS normalized_event_name,
           LOWER(TRIM(COALESCE(country, ''))) AS normalized_country,
           LOWER(TRIM(COALESCE(city, ''))) AS normalized_city,
           COUNT(*) AS duplicate_count,
           MIN(id) AS keeper_id
    FROM crusades
    WHERE event_name IS NOT NULL AND TRIM(event_name) <> ''
      AND event_date IS NOT NULL AND TRIM(event_date) <> ''
    GROUP BY event_date, LOWER(TRIM(event_name)), LOWER(TRIM(COALESCE(country, ''))), LOWER(TRIM(COALESCE(city, '')))
    HAVING COUNT(*) > 1
  ), matching_groups AS (
    SELECT duplicate_groups.*
    FROM duplicate_groups
    WHERE @search = '' OR EXISTS (
      SELECT 1
      FROM crusades search_crusade
      LEFT JOIN reports search_report ON search_report.id = search_crusade.report_id
      WHERE search_crusade.event_date = duplicate_groups.event_date
        AND LOWER(TRIM(search_crusade.event_name)) = duplicate_groups.normalized_event_name
        AND LOWER(TRIM(COALESCE(search_crusade.country, ''))) = duplicate_groups.normalized_country
        AND LOWER(TRIM(COALESCE(search_crusade.city, ''))) = duplicate_groups.normalized_city
        AND (search_crusade.event_name LIKE @search
          OR search_crusade.city LIKE @search
          OR search_crusade.country LIKE @search
          OR search_crusade.zone LIKE @search
          OR search_crusade.group_name LIKE @search
          OR search_crusade.church_name LIKE @search
          OR search_crusade.network_name LIKE @search
          OR search_report.contact_name LIKE @search
          OR search_report.contact_email LIKE @search
          OR search_report.kingschat_username LIKE @search)
    )
  )`;

function duplicateSearch(query = {}) {
  const searchText = String(query.q || "").trim().slice(0, 200);
  return searchText ? `%${searchText}%` : "";
}

function duplicateSummary(search) {
  return db.prepare(`${DUPLICATE_REPORT_GROUPS}
    SELECT COALESCE(SUM(duplicate_count), 0) AS total,
           COUNT(*) AS duplicate_groups,
           COALESCE(SUM(duplicate_count - 1), 0) AS excess_reports
    FROM matching_groups
  `).get({ search });
}

export function duplicateReportPage(query = {}) {
  const pageSize = Math.min(Math.max(parseInt(query.page_size, 10) || 25, 1), 100);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const search = duplicateSearch(query);
  const summary = duplicateSummary(search);
  const rows = db.prepare(`${DUPLICATE_REPORT_GROUPS}
    SELECT c.id, c.report_id, c.created_at AS submitted_at, c.event_date, c.event_name,
           c.event_type, c.other_event_type, c.format, c.city, c.country, c.venue, c.minister_name,
           c.organization_type, c.zone, c.group_name, c.church_name, c.cell_name, c.network_name,
           c.attendance, c.online_participation,
           r.contact_name, r.contact_email, r.phone_country_code, r.phone_number, r.kingschat_username,
           matching_groups.normalized_event_name, matching_groups.duplicate_count, matching_groups.keeper_id
    FROM matching_groups
    JOIN crusades c
      ON c.event_date = matching_groups.event_date
      AND LOWER(TRIM(c.event_name)) = matching_groups.normalized_event_name
      AND LOWER(TRIM(COALESCE(c.country, ''))) = matching_groups.normalized_country
      AND LOWER(TRIM(COALESCE(c.city, ''))) = matching_groups.normalized_city
    LEFT JOIN reports r ON r.id = c.report_id
    ORDER BY c.event_date DESC, matching_groups.normalized_country, matching_groups.normalized_city,
             matching_groups.normalized_event_name, c.created_at, c.id
    LIMIT @limit OFFSET @offset
  `).all({ search, limit: pageSize, offset: (page - 1) * pageSize });

  return { rows, ...summary, page, page_size: pageSize };
}

export function deleteCrusadeReportRow(row) {
  db.prepare("DELETE FROM crusades WHERE id = ?").run(row.id);
  const reportDeleted = !db.prepare("SELECT 1 FROM crusades WHERE report_id = ?").get(row.report_id);
  if (reportDeleted) {
    deleteReportPhotos(row.report_id);
    db.prepare("DELETE FROM reports WHERE id = ?").run(row.report_id);
  }
  return { id: row.id, report_id: row.report_id, report_deleted: reportDeleted };
}

const DUPLICATE_KEEP_STRATEGIES = new Set(["earliest", "latest", "highest", "best"]);

function duplicateCandidateScores(row) {
  const reportedFigures = ["attendance", ...METRIC_FIELDS]
    .reduce((total, field) => total + Math.max(Number(row[field]) || 0, 0), 0);
  const meaningfulFields = [
    "registration_item_id", "city_place_id", "venue", "minister_name", "other_event_type",
    "contact_name", "contact_email", "phone_number", "kingschat_username",
    "highlights", "media_links", "photo_links", "video_links",
  ];
  const completeness = meaningfulFields.reduce(
    (total, field) => total + (String(row[field] ?? "").trim() ? 1 : 0),
    0,
  );
  return { reportedFigures, completeness };
}

function laterDuplicate(left, right) {
  const created = String(left.created_at || "").localeCompare(String(right.created_at || ""));
  return created || left.id - right.id;
}

function chooseDuplicateKeeper(rows, strategy) {
  return rows.reduce((keeper, candidate) => {
    if (!keeper) return candidate;
    if (strategy === "earliest") return candidate.id < keeper.id ? candidate : keeper;
    if (strategy === "latest") return laterDuplicate(candidate, keeper) > 0 ? candidate : keeper;
    const candidateScores = duplicateCandidateScores(candidate);
    const keeperScores = duplicateCandidateScores(keeper);
    if (strategy === "best" && candidateScores.completeness !== keeperScores.completeness) {
      return candidateScores.completeness > keeperScores.completeness ? candidate : keeper;
    }
    if (candidateScores.reportedFigures !== keeperScores.reportedFigures) {
      return candidateScores.reportedFigures > keeperScores.reportedFigures ? candidate : keeper;
    }
    return laterDuplicate(candidate, keeper) > 0 ? candidate : keeper;
  }, null);
}

export function cleanDuplicateReports(strategy, query = {}, expectedExcessReports) {
  if (!DUPLICATE_KEEP_STRATEGIES.has(strategy)) {
    throw new ApiError(400, "INVALID_STRATEGY", "Choose earliest, latest, highest figures, or best record.");
  }
  const expected = Number(expectedExcessReports);
  if (!Number.isSafeInteger(expected) || expected < 0) {
    throw new ApiError(400, "CONFIRMATION_REQUIRED", "Confirm the current number of extra reports before cleaning duplicates.");
  }

  return db.transaction(() => {
    const search = duplicateSearch(query);
    const current = duplicateSummary(search);
    if (current.excess_reports !== expected) {
      throw new ApiError(409, "DUPLICATES_CHANGED", "The duplicate totals changed. Review the refreshed list before cleaning again.");
    }
    const rows = db.prepare(`${DUPLICATE_REPORT_GROUPS}
      SELECT c.*, r.contact_name, r.contact_email, r.phone_country_code, r.phone_number,
             r.kingschat_username, r.highlights, r.media_links, r.photo_links, r.video_links,
             matching_groups.normalized_event_name, matching_groups.normalized_country,
             matching_groups.normalized_city
      FROM matching_groups
      JOIN crusades c
        ON c.event_date = matching_groups.event_date
        AND LOWER(TRIM(c.event_name)) = matching_groups.normalized_event_name
        AND LOWER(TRIM(COALESCE(c.country, ''))) = matching_groups.normalized_country
        AND LOWER(TRIM(COALESCE(c.city, ''))) = matching_groups.normalized_city
      LEFT JOIN reports r ON r.id = c.report_id
      ORDER BY c.id
    `).all({ search });
    const groups = new Map();
    for (const row of rows) {
      const key = JSON.stringify([row.event_date, row.normalized_event_name, row.normalized_country, row.normalized_city]);
      groups.set(key, [...(groups.get(key) || []), row]);
    }

    let reportsDeleted = 0;
    const keptIds = [];
    for (const group of groups.values()) {
      const keeper = chooseDuplicateKeeper(group, strategy);
      keptIds.push(keeper.id);
      for (const row of group) {
        if (row.id === keeper.id) continue;
        deleteCrusadeReportRow(row);
        reportsDeleted += 1;
      }
    }
    return { strategy, groups_cleaned: groups.size, reports_deleted: reportsDeleted, kept_ids: keptIds };
  })();
}
