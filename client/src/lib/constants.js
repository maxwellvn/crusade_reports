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
  ["rabah", "RABAH Crusades"],
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

// Network-only: how a collaborating zone/network contributes to a crusade.
// Multi-select; the stored value is the label itself, joined with commas.
export const ZONE_CONTRIBUTIONS = [
  "Sending Pastors",
  "Sending Partners",
  "Sponsorship of Rhapsody of Realities",
  "Sponsorship of Books",
  "Sponsorship of Crusade Logistics",
];

// Network-only: whether the crusade's required permits have been obtained.
export const PERMIT_OPTIONS = ["Yes", "No", "Not applicable"];

// Unique international calling codes. The compact selector sits beside the
// national phone number; shared codes (for example +1) appear once.
export const PHONE_CODES = (
  "+1 +7 +20 +27 +30 +31 +32 +33 +34 +36 +39 +40 +41 +43 +44 +45 +46 +47 +48 +49 +51 +52 +53 +54 +55 +56 +57 +58 +60 +61 +62 +63 +64 +65 +66 +81 +82 +84 +86 +90 +91 +92 +93 +94 +95 +98 " +
  "+211 +212 +213 +216 +218 +220 +221 +222 +223 +224 +225 +226 +227 +228 +229 +230 +231 +232 +233 +234 +235 +236 +237 +238 +239 +240 +241 +242 +243 +244 +245 +246 +248 +249 +250 +251 +252 +253 +254 +255 +256 +257 +258 +260 +261 +262 +263 +264 +265 +266 +267 +268 +269 +290 +291 +297 +298 +299 " +
  "+350 +351 +352 +353 +354 +355 +356 +357 +358 +359 +370 +371 +372 +373 +374 +375 +376 +377 +378 +379 +380 +381 +382 +383 +385 +386 +387 +389 +420 +421 +423 " +
  "+500 +501 +502 +503 +504 +505 +506 +507 +508 +509 +590 +591 +592 +593 +594 +595 +596 +597 +598 +599 +670 +672 +673 +674 +675 +676 +677 +678 +679 +680 +681 +682 +683 +685 +686 +687 +688 +689 +690 +691 +692 " +
  "+850 +852 +853 +855 +856 +880 +886 +960 +961 +962 +963 +964 +965 +966 +967 +968 +970 +971 +972 +973 +974 +975 +976 +977 +992 +993 +994 +995 +996 +998"
).split(" ");

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

// RABAH-specific outcome fields — shown only when the crusade type is "rabah".
export const RABAH_OUTCOMES = [
  ["rabah_crusades", "Number of RABAH Crusades"],
  ["rabah_people_reached", "People reached per RABAH Cell"],
];

// Every metric key (used for defaults, totals, import columns).
// online_participation = ONLINE ATTENDANCE — promoted out of the outcome lists
// to sit beside onsite attendance, but still a DB metric column.
export const METRIC_KEYS = ["online_participation", ...CORE_OUTCOMES, ...EXTENDED_OUTCOMES, ...RABAH_OUTCOMES].map((k) => (Array.isArray(k) ? k[0] : k));

export const emptyCrusade = () => ({
  format: "",
  event_type: "",
  other_event_type: "",
  event_name: "",
  country: "",
  city: "",
  city_place_id: "",
  event_date: "",
  attendance: 0,
  crusade_expense: 0,
  minister_name: "",
  venue: "",
  ...Object.fromEntries(METRIC_KEYS.map((k) => [k, 0])),
});

// Loveworld Blue Elite staff departments — the official list of ministry units
// that can register crusades for NOTC. Used by the Blue Elite registration form's
// department picker. Deduplicated from the broadcast schedule order.
export const BLUE_ELITE_DEPARTMENTS = [
  "BLW International Office UK",
  "CE Aba Zone",
  "CE Aba Zone (South East Nigeria Region)",
  "CE Abuja Zone (DSP Region)",
  "CE Accra Ghana Zone (DSP)",
  "CE Amsterdan",
  "CE Benin Zone 1",
  "CE Benin Zone 2(South East Nigeria Region)",
  "CE Canada Region / Zone",
  "CE Dallas Zone (USA Region 2)",
  "CE East West Central Africa Zone 1",
  "CE East West Central Africa Zone 2",
  "CE East West Central Africa Zone 3",
  "CE East West Central Africa Zone 5",
  "CE East West Central Africa Zone 6",
  "CE Edo North & Edo Central (South East Nigeria Region)",
  "CE Kenya Zone",
  "CE Lagos Sub Zone A",
  "CE Lagos Sub Zone B (DSP Region)",
  "CE Lagos Sub Zone C",
  "CE Lagos Sub Zone D",
  "CE Lagos Zone 1",
  "CE Lagos Zone 2",
  "CE Lagos Zone 3(DSP Region)",
  "CE Lagos Zone 4(DSP Region)",
  "CE Lagos Zone 5(DSP Region)",
  "CE Lagos Zone 6",
  "CE Middle East & South East Asia Region",
  "CE Middle East and South CE India",
  "CE Midwest Zone (DSP Region)",
  "CE Ministry Center Abuja",
  "CE Ministry Center Calabar",
  "CE Ministry Centre Ibadan",
  "CE Ministry Centre Warri",
  "CE North Central Zone 1(North East Nigeria Region)",
  "CE North Central Zone 2(North East Nigeria Region)",
  "CE North East Zone 1(Nigeria Region)",
  "CE North West Zone 1",
  "CE North West Zone 2 (North West Nigeria Region)",
  "CE Onitsha Zone",
  "CE Otawa Zone",
  "CE Port Harcourt Zone 1(DSP Region)",
  "CE Port Harcourt Zone 2(DSP Region)",
  "CE Port Harcourt Zone 3",
  "CE Quebec Zone",
  "CE South Africa Zone 1(DSP Region)",
  "CE South Africa Zone 2(Southern Africa Region)",
  "CE South Africa Zone 3(Southern Africa Region)",
  "CE South Africa Zone 4(Southern Africa Region)",
  "CE South Africa Zone 5(DSP Region)",
  "CE South East Zone 1(South East Nigeria Region)",
  "CE South East Zone 2 (South East Nigeria Region)",
  "CE South East Zone 3 (South East Nigeria Region)",
  "CE Southern Africa Regional Office",
  "CE South West Nigeria Regional Office",
  "CE South West Regional Office",
  "CE South West Zone 4",
  "CE South West Zone 5",
  "CE South West Zone1(Nigerian Region)",
  "CE South West Zone2(Nigerian Region)",
  "CE South West Zone3(Nigerian Region)",
  "CE SSZ1",
  "CE SSZ2",
  "CE SSZ3",
  "CE Toronto (Canada and Central America Region)",
  "CE UK Region 2 Regional Office",
  "CE UK Region 2 Zone 1",
  "CE UK Region 2 Zone 3",
  "CE UK Region 2 Zone 4",
  "CE UK Zone 1",
  "CE UK Zone 2 DSP",
  "CE UK Zone 4 DSP",
  "CE USA Region 1 Zone 1 (DSP Region)",
  "CE USA Region 1 Zone 2",
  "CE USA Region 3 Texas Zone",
  "CE Warri Dsc Sub Zone (DSP Region)",
  "CE Western Europe Zone 2",
  "CE Western Europe Zone 3",
  "CELVZ",
  "Cell Ministry",
  "CGI",
  "Children's Ministry",
  "Church Consolidation Mission",
  "Church Ministry",
  "Digital Sovereignty and Technology Ministry",
  "East West Central Africa Zone 4",
  "FSD",
  "GSO",
  "Healing School Executive Rep",
  "Innercity Mission for Children",
  "Kiddies Media Ministry",
  "LM247 & LMCC",
  "LMP",
  "LTM & Radio",
  "LXP",
  "LoveWorld Canada (Loveworld Networks)",
  "LoveWorld SAT (Loveworld Networks)",
  "Loveworld Audiovisuals",
  "Loveworld Church Zone",
  "Loveworld Commerce",
  "Loveworld Films And Arts, Sports and Entrainment Ministry",
  "Loveworld Foundation School",
  "Loveworld Music Ministry",
  "Loveworld Security",
  "Loveworld Teens and Youth Ministry",
  "Loveworld UK (Loveworld Networks)",
  "Loveworld USA (Loveworld Networks)",
  "LW Graduate Network",
  "LW Programs",
  "LWPM",
  "Middle East & South East Asia Region",
  "Ministry Center Abeokuta",
  "Ministry Center Port Harcourt",
  "Ministry Of Healing, Health And Social Services",
  "Ministry Of Human Resource Transformation",
  "Ministry Of Information",
  "Ministry of Corporate Affairs",
  "Ministry of Cost Economy",
  "Ministry of Discipleship",
  "Ministry of Education",
  "Ministry of Food Technology And Sovereignty",
  "Ministry of Humanitarian Affairs",
  "Ministry of Ministerial Leadership Development",
  "New Media Ministries",
  "OCOS",
  "OFTP",
  "Office of the Exchequer",
  "Office of the Head of Service",
  "Office of the Prime Minister",
  "Office of the Secretary General",
  "ROR",
  "The Haven",
  "Western Europe Regional Office",
  "World Evangelism Mobilization",
];
