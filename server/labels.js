// Human labels for export columns — mirrors client/src/lib/constants.js. Kept as a
// separate copy because the client file is browser-only; this powers CSV/XLSX exports.

export const CRUSADE_TYPE_LABELS = {
  mega: "Mega Crusades (4,000+ people)", tap2read: "TAP2read Outreach", rabah: "Rabah Cellular Outreach",
  "youths-aglow": "Youths Aglow Outreach",
  teevolution: "Teevolution Outreach (Teens)", "say-yes-to-kids": "Say Yes To Kids Outreach",
  nolb: "No One Left Behind Outreach", "leading-ladies": "Leading Ladies Outreach", "mighty-men": "Mighty Men Outreach",
  professionals: "Specialized Outreach to Professionals", tv: "TV Crusades", radio: "Radio Crusades",
  "social-media": "Social Media Outreach", online: "Online Crusades", mystreamspace: "MyStreamSpace Crusades",
  mall: "Mall Outreach", school: "School Outreach", hospital: "Hospital Outreach", street: "Street Outreach",
  prison: "Prison Outreach", "transport-station": "Transport Station Outreach", village: "Village Outreach",
  community: "Community Outreach", football: "Football Stadium Outreach", other: "Other Outreach",
};

const outreachLabel = (label) => {
  const normalized = String(label || "Other").trim();
  if (/outreach$/i.test(normalized)) return normalized;
  return normalized.replace(/crusades?$/i, "Outreach").trim() || "Other Outreach";
};

// event_type may be a custom "other" value — show the specified text when present.
export const typeLabel = (type, other) =>
  type === "other" && other ? outreachLabel(other) : (CRUSADE_TYPE_LABELS[type] || (type === "cellular" ? "Rabah Cellular Outreach" : type || ""));

export const METRIC_LABELS = {
  salvation: "Salvations", holy_spirit_filled: "Holy Spirit Baptisms", water_baptisms: "Water Baptisms",
  ror_distributed: "Rhapsody Distributed", bibles_distributed: "Bibles Distributed",
  online_participation: "Online Participation", radio_tv_reach: "Radio/TV Reach",
  testimonies_recorded: "Testimonies Recorded", tap2read_distributed: "TAP2read Distributed",
  ntyba_distributed: "NTYBA Distributed", healing_nations_magazine: "Healing to the Nations Magazine",
  rabah_crusades: "Number of RABAH Crusades", rabah_people_reached: "People reached per RABAH Cell",
};

export const FORMAT_LABELS = { physical: "Physical", online: "Online" };

export const READINESS_LABELS = {
  confirmed: "Confirmed", pending: "Pending confirmation", preparing: "Preparing",
  ready: "Ready", holding: "Holding as planned", held: "Held", not_holding: "Not holding",
};

export const ORG_TYPE_LABELS = { zone: "Zone", group: "Group", church: "Church", cell: "Cell", network: "Network" };

export const yesNo = (value) => (value ? "Yes" : "No");
export const phone = (code, number) => [code, number].filter(Boolean).join(" ");
