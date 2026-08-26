// Personal dashboard capability links expose only data owned by the linked
// zone/network. Event type describes a crusade; it does not transfer ownership
// to a similarly named network.
export function personalDashboardScope({ name, kind }) {
  const col = kind === "network" ? "network_name" : "zone";
  return {
    col,
    listWhere: (prefix = "") => `${prefix}${col} = ?`,
    listParams: [name],
    totalsWhere: `${col} = ?`,
    registrationsWhere: `r.${col} = ?`,
  };
}
