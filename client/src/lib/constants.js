// Was the crusade held on the ground or virtually? Drives which attendance
// fields show. A physical crusade streamed online just fills both numbers.
export const FORMATS = [
  ["physical", "Physical (on the ground)"],
  ["online", "Online (virtual)"],
];
// Types that are virtual by nature — used to pre-select the Online format.
export const ONLINE_TYPES = ["tv", "radio", "social-media", "online", "mystreamspace"];

export const CRUSADE_TYPES = [
  ["mega", "Mega Crusades (4,000+ people)"],
  ["tap2read", "TAP2read Crusades"],
  ["youths-aglow", "Youths Aglow Crusades"],
  ["teevolution", "Teevolution Crusades (Teens)"],
  ["say-yes-to-kids", "Say Yes To Kids Crusades"],
  ["nolb", "No One Left Behind Crusades"],
  ["leading-ladies", "Leading Ladies Crusades"],
  ["mighty-men", "Mighty Men Crusades"],
  ["professionals", "Specialized Crusades to Professionals"],
  ["tv", "TV Crusades"],
  ["radio", "Radio Crusades"],
  ["social-media", "Social Media Crusades"],
  ["online", "Online Crusades"],
  ["mystreamspace", "MyStreamSpace Crusades"],
  ["mall", "Mall Crusades"],
  ["school", "School Crusades"],
  ["hospital", "Hospital Crusades"],
  ["street", "Street Crusades"],
  ["prison", "Prison Crusades"],
  ["transport-station", "Transport Station Crusades"],
  ["village", "Village Crusades"],
  ["community", "Community Crusades"],
  ["football", "Football Stadium Crusades"],
  ["other", "Other"],
];

// Outcome metrics now live PER CRUSADE. Split by prominence so the row shows the
// high-value ones inline and tucks the long tail behind a labelled expander.
export const CORE_OUTCOMES = [
  ["salvation", "Salvations"],
  ["holy_spirit_filled", "Holy Spirit Baptisms"],
  ["water_baptisms", "Water Baptisms"],
  ["ror_distributed", "Rhapsody Distributed"],
  ["bibles_distributed", "Bibles Distributed"],
];

export const EXTENDED_OUTCOMES = [
  ["radio_tv_reach", "Radio/TV Reach"],
  ["testimonies_recorded", "Testimonies Recorded"],
  ["tap2read_distributed", "TAP2read Distributed"],
  ["ntyba_distributed", "NTYBA Distributed"],
  ["healing_nations_magazine", "Healing to the Nations Mag."],
];

// Every metric key (used for defaults, totals, import columns).
// online_participation = ONLINE ATTENDANCE — promoted out of the outcome lists
// to sit beside onsite attendance, but still a DB metric column.
export const METRIC_KEYS = ["online_participation", ...CORE_OUTCOMES, ...EXTENDED_OUTCOMES].map((k) => (Array.isArray(k) ? k[0] : k));

export const emptyCrusade = () => ({
  format: "",
  event_type: "",
  other_event_type: "",
  event_name: "",
  city: "",
  city_place_id: "",
  event_date: "",
  attendance: 0,
  minister_name: "",
  venue: "",
  ...Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])),
});
