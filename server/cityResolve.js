import { logger } from "./logger.js";
import { cityAutocomplete } from "./routes/places.js";
import { countryCodeByName } from "./routes/countries.js";

// Geocode a city for import. Try the typed string against Places first; if
// nothing matches, retry without a trailing "Online Hub NNNN" suffix (reporters
// append it to make rows distinct, e.g. "Bujumbura – Online Hub 0001"). On a
// base match the canonical city name wins and the suffix is dropped. Cached per
// country+base, so a file with tens of thousands of suffixed rows only makes a
// handful of lookups and warnings.
export async function resolveCity(city, country, cache, warnings, logTag) {
  const cc = countryCodeByName(country);
  const base = city.replace(/\s*[–—-]\s*Online Hub\s*\d+\s*$/i, "").trim();
  const key = `${country.toLowerCase()}:${(base || city).toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);

  let resolved = { name: city, place_id: "" };
  try {
    const preds = await cityAutocomplete(city, cc);
    if (preds.length && preds[0].main) {
      resolved = { name: preds[0].main, place_id: preds[0].place_id || "" };
    } else if (base && base !== city) {
      const basePreds = await cityAutocomplete(base, cc);
      if (basePreds.length && basePreds[0].main) {
        resolved = { name: basePreds[0].main, place_id: basePreds[0].place_id || "" };
        warnings.push(`City "${city}" matched "${basePreds[0].main}" (online-hub suffix removed).`);
      } else {
        warnings.push(`City "${city}" was not found in ${country} — kept as you typed it.`);
      }
    } else {
      warnings.push(`City "${city}" was not found in ${country} — kept as you typed it.`);
    }
  } catch (e) {
    logger.warn({ err: e, city }, `${logTag} city geocode failed — keeping typed name`);
    warnings.push(`City "${city}" could not be checked — kept as you typed it.`);
  }
  cache.set(key, resolved);
  return resolved;
}