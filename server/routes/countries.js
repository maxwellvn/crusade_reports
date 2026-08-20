import { Router } from "express";
import { wrap } from "../logger.js";
import { continentForCode } from "../countryContinents.js";

export const countries = Router();

// ISO 3166-1 alpha-2 codes; names derived via Intl.DisplayNames (Node has full ICU).
// ponytail: no country-list dependency, no hand-typed names — codes + Intl does it.
const CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " "
  );

const dn = new Intl.DisplayNames(["en"], { type: "region" });
const DISPLAY_NAME_OVERRIDES = { SH: "Saint Helena", TR: "Turkey" };
export const COUNTRIES = CODES.map((code) => ({ code, name: DISPLAY_NAME_OVERRIDES[code] || dn.of(code) || code, continent: continentForCode(code) }))
  .filter((c) => c.name && c.name !== c.code)
  .sort((a, b) => a.name.localeCompare(b.name));

// name (any case) -> ISO code, for resolving a typed country during import.
export const countryCodeByName = (name) =>
  ({ "st helena": "SH", "st. helena": "SH", türkiye: "TR", turkiye: "TR" }[String(name || "").trim().toLowerCase()]
    || COUNTRIES.find((c) => c.name.toLowerCase() === String(name || "").trim().toLowerCase())?.code
    || "");

// Aliases that don't resolve via exact name match (Intl DisplayNames wording
// differs from what uploaders type). All values are canonical COUNTRIES names.
const NAME_ALIASES = {
  "united states": "United States",
  "united states of america": "United States",
  usa: "United States",
  america: "United States",
  uk: "United Kingdom",
  "united kingdom": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  uae: "United Arab Emirates",
  emirates: "United Arab Emirates",
  drc: "Congo - Kinshasa",
  "dr congo": "Congo - Kinshasa",
  "congo drc": "Congo - Kinshasa",
  "congo dr": "Congo - Kinshasa",
  "democratic republic of congo": "Congo - Kinshasa",
  "democratic republic of the congo": "Congo - Kinshasa",
  "congo, democratic republic of the": "Congo - Kinshasa",
  congo: "Congo - Kinshasa",
  "republic of the congo": "Congo - Brazzaville",
  "congo brazzaville": "Congo - Brazzaville",
  "congo, republic of the": "Congo - Brazzaville",
  "congo-brazzaville": "Congo - Brazzaville",
  "congo-kinshasa": "Congo - Kinshasa",
  "ivory coast": "Côte d’Ivoire",
  "cote d'ivoire": "Côte d’Ivoire",
  "côte d'ivoire": "Côte d’Ivoire",
  "cabo verde": "Cape Verde",
  russia: "Russia",
  swaziland: "Eswatini",
  "east timor": "Timor-Leste",
  laos: "Laos",
  czechia: "Czechia",
  "czech republic": "Czechia",
  "south korea": "South Korea",
  "republic of korea": "South Korea",
  "north korea": "North Korea",
  "democratic people's republic of korea": "North Korea",
  "south sudan": "South Sudan",
  "tanzania, united republic of": "Tanzania",
  vietnam: "Vietnam",
  "viet nam": "Vietnam",
  syria: "Syria",
  iran: "Iran",
  "myanmar (burma)": "Myanmar (Burma)",
  burma: "Myanmar (Burma)",
  turkey: "Turkey",
  türkiye: "Turkey",
  "palestine": "Palestinian Territories",
  "palestinian territory": "Palestinian Territories",
  "west bank and gaza": "Palestinian Territories",
  "saint helena": "Saint Helena",
  "st. helena": "Saint Helena",
  "st helena": "Saint Helena",
  "bolivia, plurinational state of": "Bolivia",
  "venezuela, bolivarian republic of": "Venezuela",
  "micronesia, federated states of": "Micronesia",
  "lao people's democratic republic": "Laos",
  "eswatini": "Eswatini",
  "korea, republic of": "South Korea",
  "russian federation": "Russia",
  "united states (usa)": "United States",
  "usa (united states)": "United States",
  "u.s.": "United States",
  "great britain": "United Kingdom",
  "north ireland": "United Kingdom",
  "cote d'ivoire (ivory coast)": "Côte d’Ivoire",
  "united kingdom (uk)": "United Kingdom",
  "congo (drc)": "Congo - Kinshasa",
  "congo (kinshasa)": "Congo - Kinshasa",
  "congo (brazzaville)": "Congo - Brazzaville",
  "dr congo (kinshasa)": "Congo - Kinshasa",
  "tanzania, united republic": "Tanzania",
};

// Map any stored country string to its canonical COUNTRIES name, or "" if
// unresolvable. Dashboards normalize through this so DISTINCT counts can never
// exceed COUNTRIES.length (242) — variant spellings collapse into one entry.
export const resolveCountryName = (name) => {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const lowered = raw.toLowerCase();
  if (NAME_ALIASES[lowered]) return NAME_ALIASES[lowered];
  const exact = COUNTRIES.find((c) => c.name.toLowerCase() === lowered);
  if (exact) return exact.name;
  const code = countryCodeByName(raw);
  if (code) return COUNTRIES.find((c) => c.code === code)?.name || "";
  return "";
};

countries.get("/", wrap((_req, res) => res.json(COUNTRIES)));
