// Filters source_strings.json down to only the UI text that actually needs
// translation. Removes country names, city names, phone codes, pure numbers,
// email addresses, URLs, crusade names (user-generated), and other strings
// the page-translator should skip.
//
// Output: server/data/translatable_strings.json

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "server", "data", "source_strings.json");
const OUT = join(ROOT, "server", "data", "translatable_strings.json");

const strings = JSON.parse(readFileSync(SRC, "utf8"));

// Country names (from Intl.DisplayNames) — already localised by the browser.
const { COUNTRIES } = await import(join(ROOT, "server", "routes", "countries.js"));
const countryNames = new Set(COUNTRIES.map((c) => c.name.toLowerCase()));

// City names from cities15000.json — array of arrays:
// [id, name, alternatenames, country, lat, lng, population]
const cities = JSON.parse(
  readFileSync(join(ROOT, "server", "data", "cities15000.json"), "utf8")
);
const cityNames = new Set();
for (const c of cities) {
  const name = String(c[1] || "").toLowerCase().trim();
  if (name) cityNames.add(name);
  const alts = String(c[2] || "").split(",");
  for (const a of alts) {
    const t = a.trim().toLowerCase();
    if (t) cityNames.add(t);
  }
}

// Continents — handled by Intl / already local
const continents = new Set([
  "africa", "asia", "europe", "americas", "oceania", "antarctica",
  "north america", "south america", "all continents",
]);

// Remaining city names, crusade names, and other dynamic content that
// slipped through the pattern filters. These are user-generated or
// place-specific and should not be translated.
const EXPLICIT_EXCLUDE = new Set([
  // City / place names not caught by cities15000.json
  "Balat", "Bangkal", "Barkhan", "Ca Mau City", "Cibubur", "Daklak",
  "Homa Bay Town", "Itamaracá", "Jhapa", "Khanewal", "Kilinochchi",
  "Koni", "Meherpur", "Mian Channu", "Pinar Delrio", "Port Vila",
  "Purukcahu", "Rambakulu City", "Scotlandwell", "Shanti Nagar",
  "Tumbang Jalemo", "Ypané", "Zulia City",
  // User-generated crusade / campaign names
  "Jesus Alive", "Jesus Alive Guyana",
  "La Carrera por la Última Alma", "La Carrera por la Última Alma Perdida",
  "Nicaragua Women's Conference", "Night of a Thousand Crusades Scotland",
  "Rhapsody Crusade Encarnacion", "Rhapsody Crusade Honduras",
  "Rhapsody End-Time Crusade Montenegro", "Youths Aglow Crusade Mauritius",
  "Côte d'Ivoire", // country name with diacritic
]);

const isTranslatable = (text) => {
  const t = text.trim();
  if (!t || t.length <= 1) return false;

  if (EXPLICIT_EXCLUDE.has(t)) return false;

  // Phone codes / phone numbers: +1, +20, +1 (469) 656-1284 ...
  if (/^\+\d[\d\s()\-]*$/.test(t)) return false;

  // Country ISO codes: AD, AE, USA ...
  if (/^[A-Z]{2,3}$/.test(t)) return false;

  // Pure numbers / dates / punctuation
  if (/^[\d\s,\-\/:.·]+$/.test(t)) return false;

  // Email addresses
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(t)) return false;

  // Bare URLs / domains
  if (/^(https?:\/\/|www\.)/i.test(t)) return false;
  if (/^[\w-]+\.(org|com|net|gov|edu|io|ai)$/i.test(t)) return false;

  // File sizes: "1.9 MB", "12 KB"
  if (/^[\d.]+\s*(KB|MB|GB|TB)$/i.test(t)) return false;

  // Country names (case-insensitive)
  if (countryNames.has(t.toLowerCase())) return false;

  // City names (case-insensitive)
  if (cityNames.has(t.toLowerCase())) return false;

  // Continents
  if (continents.has(t.toLowerCase())) return false;

  // Single punctuation / symbols
  if (/^[\s·*,\/.\-—–()]+$/.test(t)) return false;

  // Specific date patterns: "12 Aug", "1 Sep", "10 Oct"
  if (/^\d{1,2}\s+(Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul)$/.test(t)) return false;

  // "Aug", "Sep" etc. standalone month abbreviations
  if (/^(Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul)$/.test(t)) return false;

  // "August 24, 2026" — full date
  if (/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/.test(t)) return false;

  // "14–27" — date range
  if (/^\d+–\d+$/.test(t)) return false;

  // KingsChat username values like "KingsChat: rorcrusades1"
  if (/^KingsChat:\s/.test(t)) return false;

  // "Sep (date TBC)" — date placeholder
  if (/^(Aug|Sep|Oct)\s*\(date TBC\)$/i.test(t)) return false;

  // User-generated crusade names — these contain "Crusade" plus a place/name.
  // Pattern: proper noun + "Crusade" or known crusade name patterns
  if (/Crusade/i.test(t) && isLikelyCrusadeName(t)) return false;

  // "Light Up <Place>" — campaign names with places
  if (/^Light Up\s+/.test(t) && t.length < 40) return false;

  // "<Place> for Jesus" — campaign names
  if (/for Jesus$/i.test(t) && t.length < 40) return false;

  // Test data
  if (/^Test(\s|$)/i.test(t) && t.length < 20) return false;

  return true;
};

// Heuristic: does this string look like a user-generated crusade name
// rather than a UI label? Crusade names typically contain a place name
// or "Miracle", "Community", "Prison", "Street", "City Wide", etc.
function isLikelyCrusadeName(t) {
  // UI labels with "Crusade" that should be kept:
  const uiLabels = new Set([
    "Crusade Registration",
    "Crusade Report",
    "Crusade date:",
    "Crusade name:",
    "Mega Crusade",
    "Teaching Crusade",
    "Teaching Crusades",
    "Rhapsody Crusade",
    "Rhapsody End-Time Crusade",
    "Night of a Thousand Crusades",
    "Night of a Thousand Crusades (NOTC)",
    "Youth Aglow Crusade",
  ]);
  if (uiLabels.has(t)) return false;

  // If it contains a place name pattern (Capitalized words before "Crusade")
  // or descriptors like Miracle, Community, Prison, Street, City Wide, etc.
  if (/\b(Miracle|Community|Prison|Street|City Wide|Prophetic|Military|Women|County|University|Village)\b/i.test(t)) return true;
  // "X Crusade" where X is a proper noun (not a UI word)
  if (/^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s+(Indonesia\s+)?Crusade$/i.test(t)) return true;
  // "Night of a Thousand Crusades - <Place>" pattern
  if (/^Night of a Thousand Crusades\s*-\s/.test(t)) return true;
  // "Rhapsody End-Time Crusade - <Place>" / "Rhapsody End-Time Crusade, <Place>"
  if (/^Rhapsody End-Time Crusade\s*[-,]\s/.test(t)) return true;
  // "Rhapsody <X> Crusade" (Prison, Women, Military...)
  if (/^Rhapsody\s+\w+\s+Crusades?$/i.test(t)) return true;
  // "Jesus Alive" variants
  if (/^Jesus Alive/i.test(t)) return true;

  return false;
}

const translatable = strings.filter(isTranslatable);
translatable.sort();
writeFileSync(OUT, JSON.stringify(translatable, null, 2));
process.stdout.write(
  `Source: ${strings.length} → Translatable: ${translatable.length}\n`
);
process.stdout.write(`Wrote ${OUT}\n`);
