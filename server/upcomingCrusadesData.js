// Source: "LIST OF UPCOMING CRUSADES BY NETWORKS – NOTC NATIONS & CONTINENTS EDITION.pdf"
// Source rows are expanded below so every selectable card represents one crusade.
const CRUSADES = [
  { code: "AO", nation: "Angola", dates: "29 Aug", names: "Night of a Thousand Crusades - Jesus Alive", types: "Mega Crusade", cities: "Luanda" },
  { code: "AR", nation: "Argentina", dates: "29 Aug & 18 Sep", names: "Rhapsody Women Crusade; Light Up Argentina", types: "Leading Ladies; Mega Crusades", cities: "Formosa" },
  { code: "BS", nation: "Bahamas", dates: "28 Aug", names: "Bahamas for Jesus", types: "Other", cities: "Nassau" },
  { code: "BD", nation: "Bangladesh", dates: "29 Aug", names: "Bollovpur Community Crusade; Khulna Community Crusade; Jesus Alive Crusade Meherpur; Joypurhut Community Crusade", types: "Mega Crusades", cities: "Jessore, Khulna, Meherpur, Rajshahi" },
  { code: "BB", nation: "Barbados", dates: "22 Aug", names: "Night of a Thousand Crusades", types: "Mega Crusades", cities: "Bridgetown" },
  { code: "BZ", nation: "Belize", dates: "29 Aug", names: "Belize Crusade", types: "Crusade", cities: "Belize" },
  { code: "BR", nation: "Brazil", dates: "Sep (date TBC)", names: "Itamarac Miracle Crusade - Night of a Thousand Crusades Brazil", types: "Mega Crusades", cities: "Itamaracá" },
  { code: "BN", nation: "Brunei", dates: "29 Aug", names: "Brunei Darussalam Crusade", types: "Mega Crusades", cities: "Bandar Seri Begawan" },
  { code: "KH", nation: "Cambodia", dates: "28 Aug", names: "Mega Crusade", types: "Mega Crusades", cities: "Kampong Cham" },
  { code: "CO", nation: "Colombia", dates: "21 Aug, 23 Aug, 29 Aug & 4 Sep", names: "La Carrera por la Última Alma Perdida; La Carrera por la Última Alma; Light Up Bucaramanga; Light Up Cucuta", types: "Mega Crusades", cities: "Sucre, Córdoba, Bucaramanga, Cúcuta" },
  { code: "CG", nation: "Congo - Brazzaville", dates: "7 Aug, 13 Aug, 28 Aug & 29 Aug", names: "Market Crusade; Brazzaville City Bus Station Crusades; Makelekele City Wide Crusade; Hospital Crusade", types: "Other; Transport Station; Mega; Hospital Crusades", cities: "Pointe-Noire, Brazzaville" },
  { code: "CR", nation: "Costa Rica", dates: "28 Aug", names: "Light Up Costa Rica", types: "Mega Crusades", cities: "San Jose" },
  { code: "CU", nation: "Cuba", dates: "28 Aug", names: "Cuba for Jesus", types: "Other", cities: "Havana, Pinar Delrio, Santiago de Cuba" },
  { code: "CI", nation: "Côte d'Ivoire", dates: "23 Aug", names: "Jesus Alive Crusade", types: "Mega Crusades", cities: "Koni" },
  { code: "DO", nation: "Dominican Republic", dates: "Sep (date TBC)", names: "Dominican Republic for Jesus", types: "Other", cities: "Santo Domingo" },
  { code: "EG", nation: "Egypt", dates: "28 Aug", names: "Egypt Crusade", types: "Street Crusades", cities: "Balat" },
  { code: "GQ", nation: "Equatorial Guinea", dates: "29 Aug", names: "Night of a Thousand Crusades - Malabo", types: "Mega Crusades", cities: "Malabo" },
  { code: "FJ", nation: "Fiji", dates: "29 Aug, 29 Aug & 5 Sep", names: "Rugby Crusade; Rugby Nadi Crusade; Teaching Crusade", types: "Other; Community Crusades", cities: "Sigatoka, Nadi, Nadi" },
  { code: "FI", nation: "Finland", dates: "9 Aug", names: "Cell Crusade", types: "Street Crusades", cities: "Helsinki" },
  { code: "FR", nation: "France", dates: "15 Aug", names: "Eiffel Tower", types: "Street Crusades", cities: "Paris" },
  { code: "GT", nation: "Guatemala", dates: "28 Aug", names: "Light Up Guatemala", types: "Mega Crusades", cities: "San Juan Sacatepequez" },
  { code: "GG", nation: "Guernsey", dates: "23 Aug", names: "Night of a Thousand Crusades", types: "Street Crusades", cities: "Saint Peter Port" },
  { code: "GY", nation: "Guyana", dates: "29 Aug", names: "Jesus Alive Guyana", types: "Mega Crusades", cities: "Linden" },
  { code: "HT", nation: "Haiti", dates: "28 Aug", names: "Haiti for Jesus", types: "Other", cities: "Cap-Haitien" },
  { code: "HN", nation: "Honduras", dates: "13 Aug & 29 Aug", names: "Ministers Teaching Crusade; Rhapsody Crusade Honduras", types: "Mega Crusades", cities: "Santa Rosa de Copan, San Pedro Sula" },
  { code: "IN", nation: "India", dates: "23 Aug", names: "India Crusade", types: "Mega Crusades", cities: "Chennai" },
  { code: "ID", nation: "Indonesia", dates: "29 Aug", names: "Bangkal Indonesia Crusade; Seruyan Indonesia Crusade; Cibubur Indonesia Crusade; Jakarta Indonesia Crusade; Manado Indonesia Crusade; Purukcahu Indonesia Crusade; Rambakulu Indonesia Crusade; Tumbang Jalemo Indonesia Crusade", types: "Mega Crusades", cities: "Bangkal, Bangkal, Cibubur, Jakarta, Manado, Purukcahu, Rambakulu City, Tumbang Jalemo" },
  { code: "KE", nation: "Kenya", dates: "12 Aug, 21 Aug, 23 Aug, 23 Aug, 27 Aug, 27 Aug, 28 Aug, 30 Aug, 4 Sep & 6 Sep", names: "Kakamega County; Youth Aglow Crusade; Kisii University; Rongo University; Kodiaga Prison Crusade; Kitale Prison Crusade; Kisumu Prophetic Crusade; Tom Mboya University; Great Lakes University; Jaramogi Oginga Odinga University", types: "Street; Youths Aglow; Prison; Mega Crusades", cities: "Kakamega, Kisumu, Kisii, Rongo, Kisumu, Kitale, Kisumu, Homa Bay Town, Kisumu, Bondo" },
  { code: "MW", nation: "Malawi", dates: "30 Aug", names: "Chiradzulu Youths Aglow Crusade", types: "Community; Youths Aglow Crusades", cities: "Blantyre" },
  { code: "MU", nation: "Mauritius", dates: "28 Aug & 29 Aug", names: "Mauritius; Night of a Thousand Crusades - Mauritius", types: "Youths Aglow; No One Left Behind Crusades", cities: "Port Louis, Mahebourg" },
  { code: "ME", nation: "Montenegro", dates: "4 Sep", names: "Night of a Thousand Crusades Montenegro", types: "Community Crusades", cities: "Podgorica" },
  { code: "MZ", nation: "Mozambique", dates: "10 Oct", names: "Jesus Is Alive Mega Crusade", types: "Mega Crusades", cities: "Chimoio" },
  { code: "NP", nation: "Nepal", dates: "1 Sep", names: "Jesus Alive", types: "Village Crusades", cities: "Jhapa" },
  { code: "NI", nation: "Nicaragua", dates: "23 Aug & 25 Aug", names: "Nicaragua Crusade; Nicaragua Women's Conference", types: "Crusade; Women's Conference", cities: "Barkhan, Ghaziabad" },
  { code: "PK", nation: "Pakistan", dates: "23 Aug, 25 Aug & 29 Aug", names: "Rhapsody End-Time Crusades; Healing Crusade", types: "Mega; Village; Street; Football Stadium Crusades", cities: "Multiple cities across Pakistan" },
  { code: "PA", nation: "Panama", dates: "6 Sep", names: "Panama City Crusade", types: "Mega Crusades", cities: "Panama City" },
  { code: "PG", nation: "Papua New Guinea", dates: "15 Aug, 20 Aug, 23 Aug, 29 Aug, 31 Aug & 5 Sep", names: "Mile Community; Gaire Village Crusade; Tubusereia Village; Papua New Guinea Mega Crusade 1; Boroka; Mega Crusade", types: "Community; Village; Mega; Other", cities: "Port Moresby" },
  { code: "PY", nation: "Paraguay", dates: "23 Aug, 29 Aug, 30 Aug & 30 Aug", names: "Rhapsody Crusade; Rhapsody Military Crusade; Rhapsody Prison Crusades; Rhapsody Crusade Encarnacion", types: "Mega; Prison Crusades", cities: "Lambaré, Ypané, Asunción, Encarnacion" },
  { code: "PR", nation: "Puerto Rico", dates: "28 Aug", names: "Puerto Rico for Jesus", types: "Other", cities: "San Juan" },
  { code: "WS", nation: "Samoa", dates: "29 Aug", names: "Teaching Crusade", types: "Community Crusades", cities: "Apia" },
  { code: "SG", nation: "Singapore", dates: "29 Aug", names: "Singapore Crusade", types: "Mega Crusades", cities: "Singapore" },
  { code: "SS", nation: "South Sudan", dates: "29 Aug", names: "Juba Miracle Crusade", types: "Mega Crusades", cities: "Juba" },
  { code: "LK", nation: "Sri Lanka", dates: "21 Aug, 22 Aug & 23 Aug", names: "Jesus Alive", types: "Community Crusades", cities: "Kilinochchi" },
  { code: "TZ", nation: "Tanzania", dates: "28 Aug & 29 Aug", names: "Dodoma Crusade; Dodoma Street Crusade", types: "Street Crusades", cities: "Dodoma" },
  { code: "TL", nation: "Timor-Leste", dates: "29 Aug", names: "East Timor Crusade", types: "Mega Crusades", cities: "Dili" },
  { code: "TC", nation: "Turks & Caicos Islands", dates: "28 Aug", names: "Turks & Caicos for Jesus", types: "Other", cities: "Cockburn Town" },
  { code: "VI", nation: "U.S. Virgin Islands", dates: "28 Aug", names: "U.S. Virgin Islands for Jesus", types: "Other", cities: "Charlotte Amalie" },
  { code: "GB", nation: "United Kingdom", dates: "30 Aug", names: "Night of a Thousand Crusades Scotland", types: "Mega Crusades", cities: "Scotlandwell" },
  { code: "VU", nation: "Vanuatu", dates: "30 Aug", names: "Vanuatu for Jesus", types: "Community Crusades", cities: "Port Vila" },
  { code: "VE", nation: "Venezuela", dates: "28 Aug & Sep (date TBC)", names: "Light Up Barquisimeto; Night of a Thousand Crusades - Maximum Impact Zulia City", types: "Mega Crusades", cities: "Barquisimeto, Zulia City" },
  { code: "VN", nation: "Vietnam", dates: "24 Aug, 25 Aug, 26 Aug, 26 Aug & 29 Aug", names: "Light Up Vietnam", types: "Village Crusades", cities: "Ca Mau City, Ho Chi Minh City, Bac Lieu, Can Tho, Daklak" },
];

const MONTHS = { Aug: 7, Sep: 8, Oct: 9 };
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function arrivalDates(dates) {
  const arrivals = [...dates.matchAll(/(\d{1,2})(?:-(\d{1,2}))?\s+(Aug|Sep|Oct)/g)].map((match) => {
    const arrival = (day) => {
      const date = new Date(Date.UTC(2026, MONTHS[match[3]], Number(day) - 7));
      return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
    };
    return match[2] ? `${arrival(match[1])}-${arrival(match[2])}` : arrival(match[1]);
  });
  return arrivals.length ? arrivals.join(", ") : "One week before the confirmed date";
}

function split(value, separator) {
  return String(value).split(separator).map((part) => part.trim()).filter(Boolean);
}

function expandCrusades(item) {
  const names = split(item.names, /\s*;\s*/);
  const dates = split(item.dates, /\s*(?:,|&)\s*/);
  const cities = split(item.cities, /\s*,\s*/);
  const count = Math.max(names.length, dates.length, cities.length);
  const valueAt = (values, index) => values.length === 1 ? values[0] : values[Math.min(index, values.length - 1)];

  return Array.from({ length: count }, (_, index) => {
    const crusadeDate = valueAt(dates, index);
    return {
      ...item,
      code: `${item.code}-${String(index + 1).padStart(2, "0")}`,
      country_code: item.code,
      names: valueAt(names, index),
      dates: crusadeDate,
      cities: valueAt(cities, index),
      year: 2026,
      arrival_dates: arrivalDates(crusadeDate),
    };
  });
}

export const UPCOMING_CRUSADES = CRUSADES.flatMap(expandCrusades);
export const upcomingCrusadeByCode = new Map(UPCOMING_CRUSADES.map((item) => [item.code, item]));
