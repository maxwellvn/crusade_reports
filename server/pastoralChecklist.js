const normalized = (value) => String(value || "").trim().replace(/\s+/g, " ").toUpperCase();

function latestByZone(rows) {
  const result = new Map();
  for (const row of rows || []) {
    const key = normalized(row.zone_name || row.zone);
    if (!key) continue;
    const current = result.get(key);
    if (!current || String(row.created_at || "") > String(current.created_at || "")) result.set(key, row);
  }
  return result;
}

function stringList(value, fallback = "") {
  try {
    const parsed = JSON.parse(value || "");
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
  } catch { /* use the legacy single-value field */ }
  return fallback ? [String(fallback)] : [];
}

export function buildPastoralChecklistRows(directory, registrationRows, nationRows) {
  const registrations = new Map();
  for (const row of registrationRows || []) {
    const key = normalized(row.zone);
    if (!key) continue;
    const current = registrations.get(key) || {
      registered_crusades: 0, cellular_crusades: 0, prayer_march_records: 0, wonders_diamond_records: 0,
    };
    registrations.set(key, {
      registered_crusades: Number(current.registered_crusades) + (Number(row.registered_crusades) || 0),
      cellular_crusades: Number(current.cellular_crusades) + (Number(row.cellular_crusades) || 0),
      prayer_march_records: Number(current.prayer_march_records) + (Number(row.prayer_march_records) || 0),
      wonders_diamond_records: Number(current.wonders_diamond_records) + (Number(row.wonders_diamond_records) || 0),
    });
  }
  const nations = latestByZone(nationRows);

  return (directory || []).map((entry) => {
    const key = normalized(entry.zone);
    const registration = registrations.get(key) || {};
    const nation = nations.get(key);
    const registeredCrusades = Number(registration.registered_crusades) || 0;
    const cellularCrusades = Number(registration.cellular_crusades) || 0;
    const prayerMarchRecords = Number(registration.prayer_march_records) || 0;
    const wondersDiamondRecords = Number(registration.wonders_diamond_records) || 0;
    const hasRegistration = registeredCrusades > 0;
    const hasCellular = cellularCrusades > 0;
    const hasNation = Boolean(nation);
    const hasPrayerMarch = prayerMarchRecords > 0;
    const hasWondersDiamond = wondersDiamondRecords > 0;
    const completedItems = [hasCellular, hasNation, hasPrayerMarch, hasWondersDiamond, hasRegistration].filter(Boolean).length;

    return {
      zone: entry.zone,
      region: entry.region,
      pastor_name: nation?.pastor_name || "",
      has_registration: hasRegistration,
      registered_crusades: registeredCrusades,
      has_cellular: hasCellular,
      cellular_crusades: cellularCrusades,
      has_nation_selection: hasNation,
      selected_nations: nation ? stringList(nation.mission_country_names, nation.mission_country_name) : [],
      nation_selected_at: nation?.created_at || null,
      has_prayer_march: hasPrayerMarch,
      prayer_march_records: prayerMarchRecords,
      has_wonders_diamond: hasWondersDiamond,
      wonders_diamond_records: wondersDiamondRecords,
      completed_items: completedItems,
      complete: completedItems === 5,
    };
  }).sort((left, right) => left.zone.localeCompare(right.zone));
}

export function pastoralChecklistSummary(rows) {
  return {
    total: rows.length,
    complete: rows.filter((row) => row.complete).length,
    registered: rows.filter((row) => row.has_registration).length,
    cellular: rows.filter((row) => row.has_cellular).length,
    nation_selected: rows.filter((row) => row.has_nation_selection).length,
    prayer_march: rows.filter((row) => row.has_prayer_march).length,
    wonders_diamond: rows.filter((row) => row.has_wonders_diamond).length,
  };
}

export function filterPastoralChecklistRows(rows, query = {}) {
  const needle = String(query.q || "").trim().toLowerCase();
  const region = String(query.region || "").trim().toLowerCase();
  const status = String(query.status || "");
  return rows.filter((row) => {
    if (needle && ![row.zone, row.region, row.pastor_name, ...row.selected_nations]
      .some((value) => String(value || "").toLowerCase().includes(needle))) return false;
    if (region && String(row.region || "").toLowerCase() !== region) return false;
    if (status === "complete" && !row.complete) return false;
    if (status === "incomplete" && row.complete) return false;
    if (status === "no_registration" && row.has_registration) return false;
    if (status === "no_cellular" && row.has_cellular) return false;
    if (status === "no_nation" && row.has_nation_selection) return false;
    if (status === "no_prayer_march" && row.has_prayer_march) return false;
    if (status === "no_wonders_diamond" && row.has_wonders_diamond) return false;
    return true;
  });
}
