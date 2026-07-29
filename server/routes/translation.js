import { Router } from "express";
import { ApiError, wrap } from "../logger.js";

export const translation = Router();

const LANGUAGES = [
  ["en", "English"], ["af", "Afrikaans"], ["am", "Amharic"], ["ar", "Arabic"], ["bn", "Bengali"], ["bg", "Bulgarian"],
  ["zh-CN", "Chinese (Simplified)"], ["zh-TW", "Chinese (Traditional)"], ["hr", "Croatian"], ["cs", "Czech"], ["da", "Danish"],
  ["nl", "Dutch"], ["fi", "Finnish"], ["fr", "French"], ["de", "German"], ["el", "Greek"],
  ["gu", "Gujarati"], ["ha", "Hausa"], ["he", "Hebrew"], ["hi", "Hindi"], ["hu", "Hungarian"], ["ig", "Igbo"],
  ["id", "Indonesian"], ["it", "Italian"], ["ja", "Japanese"], ["kn", "Kannada"], ["ko", "Korean"], ["ms", "Malay"],
  ["ml", "Malayalam"], ["mr", "Marathi"], ["ne", "Nepali"], ["no", "Norwegian"], ["fa", "Persian"], ["pl", "Polish"],
  ["pt", "Portuguese"], ["pa", "Punjabi"], ["ro", "Romanian"], ["ru", "Russian"], ["sr", "Serbian"], ["sk", "Slovak"],
  ["so", "Somali"], ["es", "Spanish"], ["sw", "Swahili"], ["sv", "Swedish"], ["ta", "Tamil"], ["te", "Telugu"],
  ["th", "Thai"], ["tr", "Turkish"], ["uk", "Ukrainian"], ["ur", "Urdu"], ["vi", "Vietnamese"], ["cy", "Welsh"],
  ["yo", "Yoruba"], ["zu", "Zulu"],
].map(([code, name]) => ({ code, name }));
const CODES = new Set(LANGUAGES.map(({ code }) => code));
const cache = new Map();
const usage = new Map();

function publicIp(value) {
  const ip = String(value || "").split(",")[0].trim().replace(/^::ffff:/, "");
  if (!ip || ip === "::1" || ip.startsWith("10.") || ip.startsWith("127.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return "";
  return ip;
}

translation.get("/languages", (_req, res) => res.json(LANGUAGES));

translation.get("/location", wrap(async (req, res) => {
  const forwardedCountry = [req.get("cf-ipcountry"), req.get("x-vercel-ip-country"), req.get("cloudfront-viewer-country")]
    .find((value) => /^[A-Z]{2}$/i.test(String(value || "")));
  if (forwardedCountry) return res.json({ country_code: forwardedCountry.toUpperCase() });

  const ip = publicIp(req.ip);
  if (!ip) return res.json({ country_code: "" });
  const response = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(4_000) }).catch(() => null);
  const body = response?.ok ? await response.json().catch(() => null) : null;
  const country = /^[A-Z]{2}$/i.test(String(body?.country || "")) ? body.country.toUpperCase() : "";
  res.json({ country_code: country });
}));

translation.post("/translate", wrap(async (req, res) => {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new ApiError(503, "TRANSLATION_UNAVAILABLE", "Page translation is not configured yet.");
  const target = String(req.body.target || "");
  const texts = Array.isArray(req.body.texts) ? req.body.texts.map((text) => String(text).trim()) : [];
  if (!CODES.has(target) || target === "en") throw new ApiError(400, "INVALID_LANGUAGE", "Choose an available translation language.");
  if (!texts.length || texts.length > 50 || texts.some((text) => !text || text.length > 600) || texts.join("").length > 12000) throw new ApiError(400, "INVALID_TEXT", "The page contains too much text to translate at once.");

  const translated = new Array(texts.length); const missing = []; const indexes = [];
  texts.forEach((text, index) => { const cached = cache.get(`${target}\0${text}`); if (cached) translated[index] = cached; else { missing.push(text); indexes.push(index); } });
  if (missing.length) {
    const ip = req.ip || "unknown"; const now = Date.now(); const recent = (usage.get(ip) || []).filter((time) => now - time < 60_000);
    if (recent.length >= 30) throw new ApiError(429, "TRANSLATION_LIMIT", "Too many translation requests. Please wait a moment and try again.");
    usage.set(ip, [...recent, now]);
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
      method: "POST", signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: missing, source: "en", target, format: "text" }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(502, "TRANSLATION_FAILED", body?.error?.message || "Google could not translate this page right now.");
    const results = body?.data?.translations || [];
    if (results.length !== missing.length) throw new ApiError(502, "TRANSLATION_FAILED", "Google returned an incomplete translation.");
    results.forEach((item, position) => { const value = String(item.translatedText || ""); translated[indexes[position]] = value; cache.set(`${target}\0${missing[position]}`, value); });
    if (cache.size > 5000) cache.delete(cache.keys().next().value);
  }
  res.json({ translations: translated });
}));
