import { db, METRIC_FIELDS } from "./db.js";
import { getManualMyStreamSpaceAdjustment } from "./mystreamspaceStats.js";
import { COUNTRIES, resolveCountryName } from "./routes/countries.js";
import { typeLabel } from "./labels.js";

const PUBLIC_REGISTRATION = "(i.program = 'public' OR i.program IS NULL)";
const ONLINE_TYPES = ["social-media", "online", "mystreamspace", "radio", "tv"];
const ONLINE_SQL = (alias = "i") => `${alias}.event_type IN (${ONLINE_TYPES.map(() => "?").join(", ")})`;
const CELLULAR_SQL = (alias = "i") => `(${alias}.organization_type = 'cell' OR ${alias}.event_type = 'rabah')`;
const countryDirectory = new Map(COUNTRIES.map((country) => [country.name, country]));

const asNumber = (value) => Number(value) || 0;
const numberFields = (row) => Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, typeof value === "number" || value == null ? asNumber(value) : value]));

function mergeCountries(rows, valueFields) {
  const merged = new Map();
  for (const row of rows) {
    const canonical = resolveCountryName(row.country);
    const country = canonical || String(row.country || "Country not specified").trim();
    if (!merged.has(country)) {
      merged.set(country, {
        country,
        canonical: Boolean(canonical),
        continent: canonical ? countryDirectory.get(canonical)?.continent || "Other" : "Unmatched",
        ...Object.fromEntries(valueFields.map((field) => [field, 0])),
      });
    }
    const entry = merged.get(country);
    for (const field of valueFields) entry[field] += asNumber(row[field]);
  }
  return [...merged.values()];
}

function continentBreakdown(rows, valueFields) {
  const continents = new Map();
  for (const row of rows.filter((entry) => entry.canonical)) {
    if (!continents.has(row.continent)) {
      continents.set(row.continent, { continent: row.continent, countries: 0, ...Object.fromEntries(valueFields.map((field) => [field, 0])) });
    }
    const entry = continents.get(row.continent);
    entry.countries += 1;
    for (const field of valueFields) entry[field] += row[field];
  }
  return [...continents.values()].sort((left, right) =>
    asNumber(right[valueFields[0]]) - asNumber(left[valueFields[0]]) || left.continent.localeCompare(right.continent));
}

function registrationProfile(database, program) {
  const row = database.prepare(`
    SELECT COALESCE(SUM(i.planned_count), 0) AS crusades,
           COUNT(i.id) AS items,
           COUNT(DISTINCT i.registration_id) AS submissions,
           COALESCE(SUM(CASE WHEN ${ONLINE_SQL("i")} THEN i.planned_count ELSE 0 END), 0) AS online,
           COALESCE(SUM(CASE WHEN NOT ${ONLINE_SQL("i")} THEN i.planned_count ELSE 0 END), 0) AS onsite,
           COUNT(DISTINCT CASE WHEN i.city IS NOT NULL AND TRIM(i.city) <> '' THEN LOWER(TRIM(i.city)) END) AS cities,
           COUNT(DISTINCT CASE WHEN i.zone IS NOT NULL AND TRIM(i.zone) <> '' THEN LOWER(TRIM(i.zone)) END) AS zones,
           COUNT(DISTINCT CASE WHEN i.network_name IS NOT NULL AND TRIM(i.network_name) <> '' THEN LOWER(TRIM(i.network_name)) END) AS networks,
           COUNT(DISTINCT CASE WHEN i.group_name IS NOT NULL AND TRIM(i.group_name) <> '' THEN LOWER(TRIM(i.group_name)) END) AS groups,
           COUNT(DISTINCT CASE WHEN i.church_name IS NOT NULL AND TRIM(i.church_name) <> '' THEN LOWER(TRIM(i.church_name)) END) AS churches,
           COUNT(DISTINCT CASE WHEN i.cell_name IS NOT NULL AND TRIM(i.cell_name) <> '' THEN LOWER(TRIM(i.cell_name)) END) AS cells,
           COALESCE(SUM(CASE WHEN i.readiness_status = 'confirmed' THEN i.planned_count ELSE 0 END), 0) AS confirmed
    FROM registration_items i
    WHERE ${program === "public" ? PUBLIC_REGISTRATION : "i.program = ?"}
  `).get(...ONLINE_TYPES, ...ONLINE_TYPES, ...(program === "public" ? [] : [program]));
  return numberFields(row);
}

function reportPerformance(database, where = "1 = 1") {
  return numberFields(database.prepare(`
    SELECT COUNT(*) AS crusades,
           COALESCE(SUM(attendance), 0) AS onsite_attendance,
           COALESCE(SUM(online_participation), 0) AS online_participation,
           COALESCE(SUM(salvation), 0) AS salvations
    FROM crusades WHERE ${where}
  `).get());
}

function withCombinedAttendance(row) {
  return { ...row, combined_attendance: asNumber(row.onsite_attendance) + asNumber(row.online_participation) };
}

function specialInitiatives(database) {
  const mediaCountries = mergeCountries(database.prepare(`
    SELECT church_country_name AS country, COUNT(*) AS registrations
    FROM media_training_registrations
    WHERE church_country_name IS NOT NULL AND TRIM(church_country_name) <> ''
    GROUP BY church_country_name
  `).all(), ["registrations"]);
  return {
    mission_nations: asNumber(database.prepare("SELECT COUNT(*) AS value FROM mission_nation_selections").get().value),
    media_training: {
      registrations: asNumber(database.prepare("SELECT COUNT(*) AS value FROM media_training_registrations").get().value),
      trainees: asNumber(database.prepare("SELECT COUNT(*) AS value FROM media_training_trainees").get().value),
      zones: asNumber(database.prepare("SELECT COUNT(DISTINCT LOWER(TRIM(zone_name))) AS value FROM media_training_registrations WHERE zone_name IS NOT NULL AND TRIM(zone_name) <> ''").get().value),
      countries: mediaCountries.filter((row) => row.canonical).length,
    },
    upcoming_crusades: asNumber(database.prepare("SELECT COUNT(*) AS value FROM upcoming_crusade_interests").get().value),
    mission_trips: asNumber(database.prepare("SELECT COUNT(*) AS value FROM mission_trip_volunteers").get().value),
  };
}

export function collectiveReportData(database = db, generatedAt = new Date()) {
  const manualMyStreamSpace = getManualMyStreamSpaceAdjustment(database);
  const publicProfile = registrationProfile(database, "public");
  const blueElite = registrationProfile(database, "blue_elite");

  const publicCountryRows = mergeCountries(database.prepare(`
    SELECT i.country, COALESCE(SUM(i.planned_count), 0) AS registered_crusades,
           COUNT(DISTINCT i.registration_id) AS registration_submissions
    FROM registration_items i WHERE ${PUBLIC_REGISTRATION}
      AND i.country IS NOT NULL AND TRIM(i.country) <> ''
    GROUP BY i.country
  `).all(), ["registered_crusades", "registration_submissions"]);
  publicProfile.countries = publicCountryRows.filter((row) => row.canonical).length;

  const reportTotals = numberFields(database.prepare(`
    SELECT COUNT(*) AS crusades,
           COUNT(DISTINCT report_id) AS reports_with_crusades,
           COALESCE(SUM(CASE WHEN format = 'online' THEN 1 ELSE 0 END), 0) AS online_crusades,
           COALESCE(SUM(CASE WHEN format <> 'online' OR format IS NULL THEN 1 ELSE 0 END), 0) AS physical_crusades,
           COALESCE(SUM(attendance), 0) AS onsite_attendance,
           ${METRIC_FIELDS.map((field) => `COALESCE(SUM(${field}), 0) AS ${field}`).join(", ")},
           COALESCE(SUM(crusade_expense), 0) AS crusade_expense
    FROM crusades
  `).get());
  const rawReportSubmissions = asNumber(database.prepare("SELECT COUNT(*) AS value FROM reports").get().value);
  reportTotals.crusades += manualMyStreamSpace.crusades;
  reportTotals.online_crusades += manualMyStreamSpace.crusades;
  reportTotals.online_participation += manualMyStreamSpace.online_attendance;
  reportTotals.combined_attendance = reportTotals.onsite_attendance + reportTotals.online_participation;

  const linkedPublicReports = asNumber(database.prepare(`
    SELECT COUNT(c.id) AS value
    FROM registration_items i JOIN crusades c ON c.registration_item_id = i.id
    WHERE ${PUBLIC_REGISTRATION}
  `).get().value);

  const organization = database.prepare(`
    SELECT i.organization_type AS level,
           COALESCE(SUM(CASE WHEN ${ONLINE_SQL("i")} THEN i.planned_count ELSE 0 END), 0) AS online,
           COALESCE(SUM(CASE WHEN NOT ${ONLINE_SQL("i")} THEN i.planned_count ELSE 0 END), 0) AS onsite,
           COALESCE(SUM(i.planned_count), 0) AS total
    FROM registration_items i WHERE ${PUBLIC_REGISTRATION}
    GROUP BY i.organization_type ORDER BY total DESC
  `).all(...ONLINE_TYPES, ...ONLINE_TYPES).map(numberFields);

  const cellularRegistration = numberFields(database.prepare(`
    SELECT COALESCE(SUM(i.planned_count), 0) AS crusades,
           COALESCE(SUM(CASE WHEN ${ONLINE_SQL("i")} THEN i.planned_count ELSE 0 END), 0) AS online,
           COALESCE(SUM(CASE WHEN NOT ${ONLINE_SQL("i")} THEN i.planned_count ELSE 0 END), 0) AS onsite
    FROM registration_items i WHERE ${PUBLIC_REGISTRATION} AND ${CELLULAR_SQL("i")}
  `).get(...ONLINE_TYPES, ...ONLINE_TYPES));
  const cellularCountries = mergeCountries(database.prepare(`
    SELECT i.country, COALESCE(SUM(i.planned_count), 0) AS registered_crusades
    FROM registration_items i WHERE ${PUBLIC_REGISTRATION} AND ${CELLULAR_SQL("i")}
      AND i.country IS NOT NULL AND TRIM(i.country) <> '' GROUP BY i.country
  `).all(), ["registered_crusades"]);
  cellularRegistration.countries = cellularCountries.filter((row) => row.canonical).length;
  const cellularReports = withCombinedAttendance(reportPerformance(database, CELLULAR_SQL("crusades")));
  const cellularOutcomes = numberFields(database.prepare(`
    SELECT COALESCE(SUM(holy_spirit_filled), 0) AS holy_spirit_filled,
           COALESCE(SUM(water_baptisms), 0) AS water_baptisms
    FROM crusades WHERE ${CELLULAR_SQL("crusades")}
  `).get());

  const registrationTypes = database.prepare(`
    SELECT i.event_type AS key, COALESCE(SUM(i.planned_count), 0) AS registered_crusades
    FROM registration_items i WHERE ${PUBLIC_REGISTRATION} AND i.event_type <> 'rabah'
    GROUP BY i.event_type
  `).all().map((row) => ({ ...numberFields(row), label: typeLabel(row.key) }));
  registrationTypes.push({ key: "cellular", label: "Rabah Cellular Outreach", registered_crusades: cellularRegistration.crusades });
  registrationTypes.sort((left, right) => right.registered_crusades - left.registered_crusades || left.label.localeCompare(right.label));

  const reportTypes = database.prepare(`
    SELECT event_type AS key, COUNT(*) AS crusades,
           COALESCE(SUM(attendance), 0) AS onsite_attendance,
           COALESCE(SUM(online_participation), 0) AS online_participation,
           COALESCE(SUM(salvation), 0) AS salvations
    FROM crusades WHERE event_type <> 'rabah' GROUP BY event_type
  `).all().map((row) => ({ ...numberFields(row), label: typeLabel(row.key) }));
  let myStreamSpaceRow = reportTypes.find((row) => row.key === "mystreamspace");
  if (!myStreamSpaceRow && (manualMyStreamSpace.crusades || manualMyStreamSpace.online_attendance)) {
    myStreamSpaceRow = { key: "mystreamspace", label: typeLabel("mystreamspace"), crusades: 0, onsite_attendance: 0, online_participation: 0, salvations: 0 };
    reportTypes.push(myStreamSpaceRow);
  }
  if (myStreamSpaceRow) {
    myStreamSpaceRow.crusades += manualMyStreamSpace.crusades;
    myStreamSpaceRow.online_participation += manualMyStreamSpace.online_attendance;
  }
  reportTypes.push({
    key: "cellular", label: "Rabah Cellular Outreach", crusades: cellularReports.crusades,
    onsite_attendance: cellularReports.onsite_attendance, online_participation: cellularReports.online_participation,
    salvations: cellularReports.salvations,
  });
  reportTypes.forEach((row) => { row.combined_reach = row.onsite_attendance + row.online_participation; });
  reportTypes.sort((left, right) => right.crusades - left.crusades || left.label.localeCompare(right.label));

  const reportCountryRows = mergeCountries(database.prepare(`
    SELECT country, COUNT(*) AS crusades_reported,
           COALESCE(SUM(attendance), 0) AS onsite_attendance,
           COALESCE(SUM(online_participation), 0) AS online_participation,
           COALESCE(SUM(salvation), 0) AS salvations
    FROM crusades WHERE country IS NOT NULL AND TRIM(country) <> '' GROUP BY country
  `).all(), ["crusades_reported", "onsite_attendance", "online_participation", "salvations"]);
  reportCountryRows.forEach((row) => { row.combined_attendance = row.onsite_attendance + row.online_participation; });

  const reportCities = database.prepare(`
    SELECT city, country, COUNT(*) AS reports,
           COALESCE(SUM(attendance), 0) + COALESCE(SUM(online_participation), 0) AS combined_attendance
    FROM crusades WHERE city IS NOT NULL AND TRIM(city) <> ''
    GROUP BY city COLLATE NOCASE, country COLLATE NOCASE
    ORDER BY reports DESC, combined_attendance DESC LIMIT 20
  `).all().map(numberFields);
  const reportCityCount = asNumber(database.prepare(`
    SELECT COUNT(*) AS value FROM (
      SELECT 1 FROM crusades
      WHERE city IS NOT NULL AND TRIM(city) <> ''
      GROUP BY LOWER(TRIM(city)), LOWER(TRIM(COALESCE(country, '')))
    )
  `).get().value);

  const outcomes = METRIC_FIELDS.map((field) => ({ key: field, value: reportTotals[field] }));
  outcomes.push({ key: "crusade_expense", value: reportTotals.crusade_expense });

  const allRegistration = {
    crusades: publicProfile.crusades + blueElite.crusades,
    online: publicProfile.online + blueElite.online,
    onsite: publicProfile.onsite + blueElite.onsite,
  };

  return {
    generated_at: generatedAt.toISOString(),
    headline: {
      total_crusades_registered: allRegistration.crusades,
      public_crusades_registered: publicProfile.crusades,
      blue_elite_crusades_registered: blueElite.crusades,
      online_crusades_registered: allRegistration.online,
      onsite_crusades_registered: allRegistration.onsite,
      report_submissions_received: rawReportSubmissions,
      crusades_reported_as_held: reportTotals.crusades,
    },
    registration_progress: {
      linked_reports: linkedPublicReports,
      awaiting_reports: Math.max(publicProfile.crusades - linkedPublicReports, 0),
    },
    public_registration: publicProfile,
    organization_registration: organization,
    cellular: {
      registration: cellularRegistration,
      reports: { ...cellularReports, ...cellularOutcomes },
    },
    reports: reportTotals,
    outcomes,
    performance: {
      zone: {
        direct_registrations: organization.find((row) => row.level === "zone") || { online: 0, onsite: 0, total: 0 },
        attributed_registrations: numberFields(database.prepare(`
          SELECT COALESCE(SUM(i.planned_count), 0) AS total FROM registration_items i
          WHERE ${PUBLIC_REGISTRATION} AND i.zone IS NOT NULL AND TRIM(i.zone) <> ''
        `).get()),
        direct_reports: withCombinedAttendance(reportPerformance(database, "organization_type = 'zone'")),
        attributed_reports: withCombinedAttendance(reportPerformance(database, "zone IS NOT NULL AND TRIM(zone) <> ''")),
      },
      network: {
        direct_registrations: organization.find((row) => row.level === "network") || { online: 0, onsite: 0, total: 0 },
        attributed_registrations: numberFields(database.prepare(`
          SELECT COALESCE(SUM(i.planned_count), 0) AS total FROM registration_items i
          WHERE ${PUBLIC_REGISTRATION} AND i.network_name IS NOT NULL AND TRIM(i.network_name) <> ''
        `).get()),
        direct_reports: withCombinedAttendance(reportPerformance(database, "organization_type = 'network'")),
        attributed_reports: withCombinedAttendance(reportPerformance(database, "network_name IS NOT NULL AND TRIM(network_name) <> ''")),
      },
    },
    registration_initiatives: registrationTypes,
    report_initiatives: reportTypes,
    blue_elite: {
      ...blueElite,
      countries: mergeCountries(database.prepare(`
        SELECT i.country, COUNT(*) AS registrations FROM registration_items i
        WHERE i.program = 'blue_elite' AND i.country IS NOT NULL AND TRIM(i.country) <> '' GROUP BY i.country
      `).all(), ["registrations"]).filter((row) => row.canonical).length,
      departments: asNumber(database.prepare("SELECT COUNT(DISTINCT department) AS value FROM registrations WHERE program = 'blue_elite' AND department IS NOT NULL AND TRIM(department) <> ''").get().value),
      reports_received: asNumber(database.prepare(`
        SELECT COUNT(c.id) AS value FROM crusades c JOIN registration_items i ON i.id = c.registration_item_id
        WHERE i.program = 'blue_elite'
      `).get().value),
      cellular: asNumber(database.prepare(`
        SELECT COALESCE(SUM(i.planned_count), 0) AS value FROM registration_items i
        WHERE i.program = 'blue_elite' AND ${CELLULAR_SQL("i")}
      `).get().value),
    },
    special_initiatives: specialInitiatives(database),
    geography: {
      registration_countries: publicCountryRows.sort((left, right) => right.registered_crusades - left.registered_crusades || left.country.localeCompare(right.country)),
      report_countries: reportCountryRows.sort((left, right) => right.crusades_reported - left.crusades_reported || left.country.localeCompare(right.country)),
      report_cities: reportCities,
      registration_continents: continentBreakdown(publicCountryRows, ["registered_crusades", "registration_submissions"]),
      report_continents: continentBreakdown(reportCountryRows, ["crusades_reported", "onsite_attendance", "online_participation", "salvations"])
        .map((row) => ({ ...row, combined_attendance: row.onsite_attendance + row.online_participation })),
      unmatched_registration: {
        labels: publicCountryRows.filter((row) => !row.canonical).length,
        crusades: publicCountryRows.filter((row) => !row.canonical).reduce((sum, row) => sum + row.registered_crusades, 0),
      },
      report_country_count: reportCountryRows.filter((row) => row.canonical).length,
      report_city_count: reportCityCount,
    },
    mystreamspace_adjustment: manualMyStreamSpace,
  };
}
