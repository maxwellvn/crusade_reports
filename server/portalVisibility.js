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
    const inheritedWhere = (prefix = "") => youthsAglow
      ? `(${prefix}${col} = ? OR ${prefix}event_type = ? OR (${prefix}zone IS NOT NULL AND ${blwZoneMatch(prefix)}))`
      : `(${prefix}${col} = ? OR ${prefix}event_type = ?)`;
    return {
      col,
      listWhere: inheritedWhere,
      listParams: [name, mappedType],
      totalsWhere: inheritedWhere(),
      totalsParams: [name, mappedType],
      registrationsWhere: youthsAglow
        ? `(r.${col} = ? OR (r.zone IS NOT NULL AND ${blwZoneMatch("r.")}) OR EXISTS (SELECT 1 FROM registration_items scoped_i WHERE scoped_i.registration_id = r.id AND scoped_i.event_type = ?))`
        : `(r.${col} = ? OR EXISTS (SELECT 1 FROM registration_items scoped_i WHERE scoped_i.registration_id = r.id AND scoped_i.event_type = ?))`,
      registrationsParams: [name, mappedType],
    };
  }
  return {
    col,
    listWhere: (prefix = "") => `${prefix}${col} = ?`,
    listParams: [name],
    totalsWhere: `${col} = ?`,
    totalsParams: [name],
    registrationsWhere: `r.${col} = ?`,
    registrationsParams: [name],
  };
}
