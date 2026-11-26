// One deployment serves several crusade campaigns. The request's host decides
// which campaign a visitor is in; every row a campaign writes is tagged with its
// id, and every read is filtered by it. NOTC is the original campaign: any host
// that is not claimed by another campaign (including localhost and the existing
// domain) is NOTC, so the portal behaves exactly as before for those hosts.

export const DEFAULT_CAMPAIGN = "notc";

export const CAMPAIGNS = {
  notc: {
    id: "notc",
    shortName: "NOTC",
    name: "A Night of a Thousand Crusades",
    host: "notc.rhapsodycrusades.org",
    hosts: [],
  },
  aac: {
    id: "aac",
    shortName: "Angels at Christmas",
    name: "Angels at Christmas Celebration Crusades",
    host: "aac.rhapsodycrusades.org",
    hosts: ["aac.rhapsodycrusades.org", "aac.localhost"],
    eventDateRange: { from: "2026-12-01", to: "2026-12-31" },
  },
};

export const CAMPAIGN_IDS = Object.keys(CAMPAIGNS);

// app_settings keys that each campaign controls on its own. NOTC reads and writes
// the bare key; other campaigns use `<campaign>:<key>`.
export const CAMPAIGN_SCOPED_SETTINGS = [
  "reporting_open",
  "default_landing_page",
  "manual_zones_enabled",
  "manual_groups_enabled",
  "manual_cities_enabled",
  "spreadsheet_duplicate_protection_enabled",
  "organization_report_credit_enabled",
];

export const campaignSettingKey = (campaign, key) => (
  assertCampaign(campaign) === DEFAULT_CAMPAIGN ? key : `${campaign}:${key}`
);

// Extra hosts per campaign for staging, e.g. CAMPAIGN_HOSTS_AAC=aac-staging.example.org,aac.test
const hostsFromEnv = (id) => String(process.env[`CAMPAIGN_HOSTS_${id.toUpperCase()}`] || "")
  .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);

const HOST_TO_CAMPAIGN = new Map(
  CAMPAIGN_IDS.flatMap((id) => [...CAMPAIGNS[id].hosts, ...hostsFromEnv(id)].map((host) => [host, id])),
);

export function campaignForHost(host) {
  const name = String(host || "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return HOST_TO_CAMPAIGN.get(name) || DEFAULT_CAMPAIGN;
}

export function assertCampaign(campaign) {
  if (!Object.hasOwn(CAMPAIGNS, campaign)) throw new Error(`Unknown campaign: ${String(campaign)}`);
  return campaign;
}

export function campaignPublicConfig(campaign) {
  const value = CAMPAIGNS[assertCampaign(campaign)];
  return {
    id: value.id,
    short_name: value.shortName,
    name: value.name,
    host: value.host,
    event_date_range: value.eventDateRange || null,
    campaigns: CAMPAIGN_IDS.map((id) => ({
      id,
      short_name: CAMPAIGNS[id].shortName,
      name: CAMPAIGNS[id].name,
      host: CAMPAIGNS[id].host,
    })),
  };
}

// Returns a user-facing validation message when a campaign restricts event
// dates. Keeping this rule next to the campaign definition makes every write
// path (manual forms, spreadsheets, portals and admin edits) use one policy.
export function campaignEventDateError(campaign, dates) {
  const value = CAMPAIGNS[assertCampaign(campaign)];
  const range = value.eventDateRange;
  if (!range) return "";
  const invalid = (Array.isArray(dates) ? dates : [dates])
    .find((date) => !date || String(date) < range.from || String(date) > range.to);
  return invalid
    ? `${value.shortName} crusade dates must be between ${range.from} and ${range.to}.`
    : "";
}

// Express middleware: req.campaign is set for every request before any route runs.
export function resolveCampaign(req, res, next) {
  req.campaign = campaignForHost(req.hostname);
  res.setHeader("X-Campaign", req.campaign);
  next();
}

// Supporting initiatives such as Blue Elite, Mission Nations and the pastoral
// checklist are NOTC programmes, not generic crusade-campaign features. Keep
// their existing NOTC behavior while making them unavailable on the AAC host.
export function requireNotcCampaign(req, res, next) {
  if (req.campaign === DEFAULT_CAMPAIGN) return next();
  return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
}
