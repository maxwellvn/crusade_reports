// Checks which strings from the live site are NOT covered by our translatable
// list or the glossary. Output shows what still needs translation.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const source = JSON.parse(readFileSync(join(ROOT, "server", "data", "source_strings.json"), "utf8"));
const translatable = JSON.parse(readFileSync(join(ROOT, "server", "data", "translatable_strings.json"), "utf8"));
const tSet = new Set(translatable);

const { COUNTRIES } = await import(join(ROOT, "server", "routes", "countries.js"));
const countryNames = new Set(COUNTRIES.map((c) => c.name.toLowerCase()));

const cities = JSON.parse(readFileSync(join(ROOT, "server", "data", "cities15000.json"), "utf8"));
const cityNames = new Set();
for (const c of cities) {
  const name = String(c[1] || "").toLowerCase().trim();
  if (name) cityNames.add(name);
  String(c[2] || "").split(",").forEach((a) => {
    const t = a.trim().toLowerCase();
    if (t) cityNames.add(t);
  });
}

const notTranslatable = source.filter((s) => !tSet.has(s));
const trulyMissed = notTranslatable.filter((s) => {
  const t = s.trim();
  if (!t || t.length <= 1) return false;
  if (/^\+\d/.test(t)) return false;
  if (/^[A-Z]{2,3}$/.test(t)) return false;
  if (/^[\d\s,\-\/:.·]+$/.test(t)) return false;
  if (/^[\s·*,\/.\-—–()]+$/.test(t)) return false;
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(t)) return false;
  if (/^(https?:\/\/|www\.)/i.test(t)) return false;
  if (/^[\w-]+\.(org|com|net|gov|edu|io|ai)$/i.test(t)) return false;
  if (/^[\d.]+\s*(KB|MB|GB|TB)$/i.test(t)) return false;
  if (countryNames.has(t.toLowerCase())) return false;
  if (cityNames.has(t.toLowerCase())) return false;
  if (["africa", "asia", "europe", "americas", "oceania", "antarctica", "north america", "south america", "all continents"].includes(t.toLowerCase())) return false;
  if (/^\d{1,2}\s+(Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul)$/.test(t)) return false;
  if (/^(Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul)$/.test(t)) return false;
  if (/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/.test(t)) return false;
  if (/^\d+–\d+$/.test(t)) return false;
  if (/^KingsChat:\s/.test(t)) return false;
  if (/^(Aug|Sep|Oct)\s*\(date TBC\)$/i.test(t)) return false;
  // Skip user-generated crusade names (glossary handles 'crusade' word)
  const crusadeUI = new Set([
    "Crusade Registration", "Crusade Report", "Crusade date:", "Crusade name:",
    "Crusade guides and operational documents", "Mega Crusade", "Teaching Crusade",
    "Teaching Crusades", "Rhapsody Crusade", "Rhapsody End-Time Crusade",
    "Night of a Thousand Crusades", "Night of a Thousand Crusades (NOTC)",
    "Youth Aglow Crusade", "Ministers Teaching Crusade",
    "Every confirmed crusade", "Choose an upcoming crusade",
  ]);
  if (/Crusade/i.test(t) && !crusadeUI.has(t)) return false;
  if (/^Light Up\s+/.test(t) && t.length < 40) return false;
  if (/for Jesus$/i.test(t) && t.length < 40) return false;
  if (/^Test(\s|$)/i.test(t) && t.length < 20) return false;
  return true;
});

console.log("Total source:", source.length);
console.log("In translatable list:", translatable.length);
console.log("Truly missed (need translation):", trulyMissed.length);
console.log("---");
trulyMissed.forEach((s) => console.log(JSON.stringify(s)));
