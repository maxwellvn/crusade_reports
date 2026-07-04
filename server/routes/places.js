import { Router } from "express";
import { db } from "../db.js";
import { logger, wrap, ApiError } from "../logger.js";

export const places = Router();

// Places API (New). Countries come from the static /api/countries list; Places is
// only used for city autocomplete (global coverage, already typo-tolerant).
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";

function key() {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new ApiError(503, "PLACES_UNCONFIGURED", "Location search is not configured");
  return k;
}

// Reusable city lookup (used by the /autocomplete route and the spreadsheet importer).
// countryCode (ISO alpha-2) biases results. Returns [{ place_id, main, secondary }].
export async function cityAutocomplete(input, countryCode) {
  input = String(input || "").trim();
  if (input.length < 1) return [];
  const body = { input, languageCode: "en", includedPrimaryTypes: ["(cities)"] };
  if (countryCode) body.includedRegionCodes = [String(countryCode).toLowerCase()];

  const resp = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = await resp.json();
  if (!resp.ok) {
    logger.error({ status: resp.status, data }, "google places (new) error");
    throw new ApiError(502, "PLACES_UPSTREAM", "City search failed");
  }
  return (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => ({
      place_id: p.placeId,
      main: p.structuredFormat?.mainText?.text || p.text?.text || "",
      secondary: p.structuredFormat?.secondaryText?.text || "",
    }));
}

// GET /api/places/autocomplete?input=&country=US
places.get("/autocomplete", wrap(async (req, res) => {
  res.json(await cityAutocomplete(req.query.input, req.query.country));
}));

// Place Details (New) — coordinates only.
async function geocodePlace(placeId) {
  const resp = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "location" },
    signal: AbortSignal.timeout(8000),
  });
  const data = await resp.json();
  if (!resp.ok || !data.location) return null;
  return { lat: data.location.latitude, lng: data.location.longitude };
}

// Geocode every distinct place_id that has no coordinates yet and write them
// back onto the fact rows. Idempotent; safe to fire-and-forget after inserts
// and on boot. Silently a no-op when the Places key is missing.
export async function backfillCityCoords() {
  if (!process.env.GOOGLE_PLACES_API_KEY) return;
  // Both fact tables share the same place_id → lat/lng shape.
  for (const table of ["crusades", "registration_items"]) {
    const pending = db.prepare(
      `SELECT DISTINCT city_place_id FROM ${table} WHERE city_place_id IS NOT NULL AND city_place_id != '' AND city_lat IS NULL`
    ).all();
    if (!pending.length) continue;
    const update = db.prepare(`UPDATE ${table} SET city_lat = ?, city_lng = ? WHERE city_place_id = ?`);
    let done = 0;
    for (const { city_place_id } of pending) {
      try {
        const loc = await geocodePlace(city_place_id);
        if (loc) { update.run(loc.lat, loc.lng, city_place_id); done++; }
      } catch (e) {
        logger.warn({ city_place_id, err: e.message }, "geocode failed — will retry on next run");
      }
    }
    if (done) logger.info({ table, done, pending: pending.length }, "city coordinates backfilled");
  }
}
