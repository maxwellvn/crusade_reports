import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { db } from "../db.js";
import { logger, wrap } from "../logger.js";
import { COUNTRIES } from "./countries.js";

export const places = Router();

// [GeoNames id, name, ASCII name, ISO country, latitude, longitude, population]
// This ships with the app, so autocomplete and coordinates incur no API calls.
const cityRows = JSON.parse(readFileSync(fileURLToPath(new URL("../data/cities15000.json", import.meta.url)), "utf8"));
const countryNames = new Map(COUNTRIES.map(({ code, name }) => [code, name]));
const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const cities = cityRows.map(([id, name, ascii, country, lat, lng, population]) => ({
  id: String(id), name, country, lat, lng, population, search: normalize(`${name} ${ascii}`),
}));
const citiesById = new Map(cities.map((city) => [city.id, city]));

export function localCityDetails(placeId) {
  const match = /^geonames:(\d+)$/.exec(String(placeId || ""));
  const city = match ? citiesById.get(match[1]) : null;
  return city ? { lat: city.lat, lng: city.lng } : null;
}

export async function cityAutocomplete(input, countryCode) {
  const query = normalize(input);
  if (!query) return [];
  const country = String(countryCode || "").toUpperCase();
  return cities
    .filter((city) => (!country || city.country === country) && city.search.includes(query))
    .sort((left, right) => {
      const prefixDifference = Number(!left.search.startsWith(query)) - Number(!right.search.startsWith(query));
      return prefixDifference || right.population - left.population || left.name.localeCompare(right.name);
    })
    .slice(0, 8)
    .map((city) => ({ place_id: `geonames:${city.id}`, main: city.name, secondary: countryNames.get(city.country) || city.country }));
}

places.get("/autocomplete", wrap(async (req, res) => {
  res.json(await cityAutocomplete(req.query.input, req.query.country));
}));

// Only new local IDs are updated. Existing Google IDs and coordinates remain untouched.
export async function backfillCityCoords() {
  for (const table of ["crusades", "registration_items"]) {
    const pending = db.prepare(
      `SELECT DISTINCT city_place_id FROM ${table} WHERE city_place_id LIKE 'geonames:%' AND city_lat IS NULL`
    ).all();
    if (!pending.length) continue;
    const update = db.prepare(`UPDATE ${table} SET city_lat = ?, city_lng = ? WHERE city_place_id = ? AND city_lat IS NULL`);
    let done = 0;
    for (const { city_place_id } of pending) {
      const location = localCityDetails(city_place_id);
      if (location) done += update.run(location.lat, location.lng, city_place_id).changes;
    }
    if (done) logger.info({ table, done }, "local city coordinates backfilled");
  }
}
