import { Router } from "express";
import { ApiError, wrap } from "../logger.js";
import { db } from "../db.js";
import { applyCrusadeGlossary } from "../crusadeGlossary.js";

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
const usage = new Map();

const readCachedTranslation = db.prepare("SELECT translated_text FROM translation_cache WHERE target_language = ? AND source_text = ?");
const writeCachedTranslation = db.prepare(`INSERT INTO translation_cache (target_language, source_text, translated_text)
  VALUES (?, ?, ?) ON CONFLICT(target_language, source_text) DO UPDATE SET translated_text = excluded.translated_text`);

export function cachedTranslation(target, source) {
  return readCachedTranslation.get(target, source)?.translated_text;
}

export function storeTranslation(target, source, translated) {
  writeCachedTranslation.run(target, source, translated);
}

export function applyTranslationGlossary(target, value, source = "") {
  if (target === "id") return String(value).replace(/\bperang\s+salib\b/gi, "Kebaktian Kebangunan Rohani (KKR)");
  if (target !== "de" || !/\bcrusades?\b/i.test(source)) return value;
  return String(value)
    .replace(/\bKreuzzügen\b/gi, "Evangelisationen")
    .replace(/\bKreuzzüge\b/gi, "Evangelisationen")
    .replace(/\bKreuzzug(?:es|s)?\b/gi, "Evangelisation")
    .replace(/\bKampagnen\b/gi, "Evangelisationen")
    .replace(/\bKampagne\b/gi, "Evangelisation")
    .replace(/\bBürgerversammlungen\b/gi, "Evangelisationsveranstaltungen")
    .replace(/\bBürgerversammlung\b/gi, "Evangelisationsveranstaltung");
}

translation.get("/languages", (_req, res) => res.json(LANGUAGES));

translation.post("/translate", wrap(async (req, res) => {
  const target = String(req.body.target || "");
  const texts = Array.isArray(req.body.texts) ? req.body.texts.map((text) => String(text).trim()) : [];
  if (!CODES.has(target) || target === "en") throw new ApiError(400, "INVALID_LANGUAGE", "Choose an available translation language.");
  if (!texts.length || texts.length > 50 || texts.some((text) => !text || text.length > 600) || texts.join("").length > 12000) throw new ApiError(400, "INVALID_TEXT", "The page contains too much text to translate at once.");

  const translated = new Array(texts.length); const missing = []; const indexes = [];
  texts.forEach((text, index) => { const cached = cachedTranslation(target, text); if (cached !== undefined) translated[index] = cached; else { missing.push(text); indexes.push(index); } });
  if (missing.length) {
    const key = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!key) {
      // No API key — return cached translations and fall back to the original
      // English for anything not in the local cache. Apply the crusade glossary
      // to every string so "crusade(s)" is always rendered as evangelistic
      // outreach, never as a military crusade — even in user-generated names.
      indexes.forEach((idx, pos) => { translated[idx] = applyCrusadeGlossary(target, missing[pos]); });
      res.json({ translations: translated.map((t) => applyCrusadeGlossary(target, t)) });
      return;
    }
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
    results.forEach((item, position) => {
      const value = applyTranslationGlossary(target, item.translatedText || "", missing[position]);
      translated[indexes[position]] = value;
      storeTranslation(target, missing[position], value);
    });
  }
  res.json({ translations: translated });
}));
