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

const readCachedTranslation = db.prepare("SELECT translated_text FROM translation_cache WHERE target_language = ? AND source_text = ?");

export function cachedTranslation(target, source) {
  return readCachedTranslation.get(target, source)?.translated_text;
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
    // Local-only translations. Fall back to glossary-applied English for
    // anything not in the cache (numbers, dates, city names, user-generated
    // content). The glossary ensures "crusade(s)" is always rendered as
    // evangelistic outreach, never as a military crusade.
    indexes.forEach((idx, pos) => { translated[idx] = applyCrusadeGlossary(target, missing[pos]); });
  }
  res.json({ translations: translated.map((t) => applyCrusadeGlossary(target, t)) });
}));
