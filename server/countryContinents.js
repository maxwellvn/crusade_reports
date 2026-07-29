// ISO alpha-2 → continent for the 242-country mission catalogue. Kept as code
// groups so the public directory can be grouped without another network call.
const GROUPS = {
  Africa: "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW RE SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH YT ZM ZW",
  Asia: "AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE IO",
  Europe: "AX AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG VA HU IS IE IM IT JE LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB",
  "North America": "AI AG AW BS BB BZ BM BQ CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MX MS NI PA PR BL KN LC MF PM VC SX TC TT US VG VI",
  "South America": "AR BO BR CL CO EC FK GF GY PY PE SR UY VE",
  Oceania: "AS AU CX CC CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV VU WF",
};

const CONTINENT_BY_CODE = new Map();
for (const [continent, codes] of Object.entries(GROUPS)) {
  for (const code of codes.split(" ")) CONTINENT_BY_CODE.set(code, continent);
}

export const continentForCode = (code) => CONTINENT_BY_CODE.get(String(code || "").toUpperCase()) || "Other";
