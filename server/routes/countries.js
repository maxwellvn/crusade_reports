import { Router } from "express";
import { wrap } from "../logger.js";

export const countries = Router();

// ISO 3166-1 alpha-2 codes; names derived via Intl.DisplayNames (Node has full ICU).
// ponytail: no country-list dependency, no hand-typed names — codes + Intl does it.
const CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " "
  );

const dn = new Intl.DisplayNames(["en"], { type: "region" });
export const COUNTRIES = CODES.map((code) => ({ code, name: dn.of(code) || code }))
  .filter((c) => c.name && c.name !== c.code)
  .sort((a, b) => a.name.localeCompare(b.name));

// name (any case) -> ISO code, for resolving a typed country during import.
export const countryCodeByName = (name) =>
  COUNTRIES.find((c) => c.name.toLowerCase() === String(name || "").trim().toLowerCase())?.code || "";

countries.get("/", wrap((_req, res) => res.json(COUNTRIES)));
