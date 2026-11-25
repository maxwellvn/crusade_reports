import { db } from "./db.js";
import { ApiError } from "./logger.js";
import { DEFAULT_CAMPAIGN, assertCampaign } from "./campaigns.js";

export function applyPortalScope(body, token, campaign = DEFAULT_CAMPAIGN) {
  if (!token) return body;
  const selectedCampaign = assertCampaign(campaign);
  const scope = selectedCampaign === DEFAULT_CAMPAIGN
    ? db.prepare("SELECT zone AS name, kind FROM zone_tokens WHERE token = ?").get(token)
    : db.prepare("SELECT zone AS name, kind FROM campaign_zone_tokens WHERE campaign = ? AND token = ?").get(selectedCampaign, token);
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
