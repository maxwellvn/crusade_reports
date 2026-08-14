// Imports all JSON translation files from server/data/translations/*.json
// into the translation_cache SQLite table. Each file is named by language
// code (e.g. "fr.json") and contains { "English source": "Translation" }.
//
// Usage: node scripts/importTranslations.js
//
// After import, the /api/translation/translate endpoint serves every
// cached translation without needing the Google Translate API key.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIR = join(ROOT, "server", "data", "translations");
const DB_PATH = join(ROOT, "data", "reports.sqlite");

if (!existsSync(DB_PATH)) {
  process.stderr.write(`Database not found at ${DB_PATH}\n`);
  process.exit(1);
}

if (!existsSync(DIR)) {
  process.stderr.write(`Translations directory not found at ${DIR}\n`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const insert = db.prepare(
  `INSERT INTO translation_cache (target_language, source_text, translated_text)
   VALUES (?, ?, ?)
   ON CONFLICT(target_language, source_text) DO UPDATE SET translated_text = excluded.translated_text`
);

const applyGlossary = (target, value, source) => {
  let v = String(value);
  if (target === "id") {
    v = v.replace(/\bperang\s+salib\b/gi, "Kebaktian Kebangunan Rohani (KKR)");
  }
  if (target === "de" && /\bcrusades?\b/i.test(source)) {
    v = v
      .replace(/\bKreuzzügen\b/gi, "Evangelisationen")
      .replace(/\bKreuzzüge\b/gi, "Evangelisationen")
      .replace(/\bKreuzzug(?:es|s)?\b/gi, "Evangelisation")
      .replace(/\bKampagnen\b/gi, "Evangelisationen")
      .replace(/\bKampagne\b/gi, "Evangelisation")
      .replace(/\bBürgerversammlungen\b/gi, "Evangelisationsveranstaltungen")
      .replace(/\bBürgerversammlung\b/gi, "Evangelisationsveranstaltung");
  }
  return v;
};

const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
let totalInserted = 0;
let totalSkipped = 0;

const insertAll = db.transaction(() => {
  for (const file of files) {
    const lang = file.replace(/\.json$/, "");
    const data = JSON.parse(readFileSync(join(DIR, file), "utf8"));
    let count = 0;
    for (const [source, translated] of Object.entries(data)) {
      if (!translated || translated === source) {
        totalSkipped++;
        continue;
      }
      const final = applyGlossary(lang, translated, source);
      insert.run(lang, source, final);
      count++;
      totalInserted++;
    }
    process.stdout.write(`  ${lang}: ${count} translations\n`);
  }
});

insertAll();
process.stdout.write(
  `\nDone. Inserted ${totalInserted} translations, skipped ${totalSkipped}.\n`
);
db.close();
