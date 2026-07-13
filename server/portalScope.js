import { db } from "./db.js";
import { ApiError } from "./logger.js";

export function applyPortalScope(body, token) {
  if (!token) return body;
  const scope = db.prepare("SELECT zone AS name, kind FROM zone_tokens WHERE token = ?").get(token);
  if (!scope) throw new ApiError(404, "INVALID_PORTAL", "This zone or network link is not valid.");
  return {
    ...body,
    organization_type: scope.kind === "network" ? "network" : "zone",
    zone: scope.kind === "zone" ? scope.name : "",
    group_name: "",
    church_name: "",
    cell_name: "",
    network_name: scope.kind === "network" ? scope.name : "",
    network_type: scope.kind === "network" ? "predefined" : "",
  };
}
