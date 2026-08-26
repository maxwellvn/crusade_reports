// Personal dashboard capability links expose only data owned by the linked
// zone/network. Event type describes a crusade; it does not transfer ownership
// to a similarly named network.
const NETWORK_EVENT_TYPES = {
  "Youths Aglow": "youths-aglow",
  "TEEVOLUTION": "teevolution",
  "Say Yes to Kids": "say-yes-to-kids",
};
export const INHERITED_NETWORK_NAMES = Object.freeze(Object.keys(NETWORK_EVENT_TYPES));
const YOUTHS_AGLOW = "Youths Aglow";
const blwZoneMatch = (prefix = "") => `(LOWER(${prefix}zone) LIKE 'blw%')`;

export function personalDashboardScope({ name, kind, includeInherited = false }) {
  const col = kind === "network" ? "network_name" : "zone";
  const mappedType = includeInherited && kind === "network" ? NETWORK_EVENT_TYPES[name] : null;
  if (mappedType) {
    const youthsAglow = name === YOUTHS_AGLOW;
    return {
      col,
      listWhere: (prefix = "") => youthsAglow
        ? `(${prefix}${col} = ? OR ${prefix}event_type = ? OR (${prefix}zone IS NOT NULL AND ${blwZoneMatch(prefix)}))`
        : `(${prefix}${col} = ? OR ${prefix}event_type = ?)`,
      listParams: [name, mappedType],
      totalsWhere: youthsAglow
        ? `(${col} = ? OR (zone IS NOT NULL AND ${blwZoneMatch()}) OR event_type = 'youths-aglow')`
        : `${col} = ?`,
      registrationsWhere: youthsAglow
        ? `(r.${col} = ? OR (r.zone IS NOT NULL AND ${blwZoneMatch("r.")}))`
        : `r.${col} = ?`,
    };
  }
  return {
    col,
    listWhere: (prefix = "") => `${prefix}${col} = ?`,
    listParams: [name],
    totalsWhere: `${col} = ?`,
    registrationsWhere: `r.${col} = ?`,
  };
}
