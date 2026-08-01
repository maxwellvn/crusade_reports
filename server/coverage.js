const normalized = (value) => String(value || "").trim().toUpperCase();
const groupKey = (zone, group) => `${normalized(zone)}\u0000${normalized(group)}`;

export function buildCoverageRows(directory, reportedRows) {
  const zoneStats = new Map();
  const groupStats = new Map();

  for (const row of reportedRows) {
    const zone = normalized(row.zone);
    const group = normalized(row.group_name);
    const values = { crusades: Number(row.crusades) || 0, attendance: Number(row.attendance) || 0 };
    if (zone) {
      const current = zoneStats.get(zone) || { crusades: 0, attendance: 0 };
      zoneStats.set(zone, { crusades: current.crusades + values.crusades, attendance: current.attendance + values.attendance });
    }
    if (zone && group) {
      const key = groupKey(zone, group);
      const current = groupStats.get(key) || { crusades: 0, attendance: 0 };
      groupStats.set(key, { crusades: current.crusades + values.crusades, attendance: current.attendance + values.attendance });
    }
  }

  const zones = directory.map((entry) => {
    const stats = zoneStats.get(normalized(entry.zone)) || { crusades: 0, attendance: 0 };
    return { name: entry.zone, region: entry.region, status: stats.crusades > 0 ? "registered" : "not_registered", ...stats };
  });
  const groups = directory.flatMap((entry) => entry.groups.map((group) => {
    const stats = groupStats.get(groupKey(entry.zone, group.name)) || { crusades: 0, attendance: 0 };
    return { id: group.id, name: group.name, zone: entry.zone, region: entry.region, status: stats.crusades > 0 ? "registered" : "not_registered", ...stats };
  }));
  const summaryFor = (rows) => ({
    total: rows.length,
    registered: rows.filter((row) => row.status === "registered").length,
    not_registered: rows.filter((row) => row.status === "not_registered").length,
  });

  return { summary: { zones: summaryFor(zones), groups: summaryFor(groups) }, zones, groups };
}
