// Walks every public page with Playwright and collects unique text nodes —
// the same set the PublicTranslator would send to /translation/translate.
// Output: server/data/source_strings.json (deduped, sorted).

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "server", "data", "source_strings.json");

const BASE = process.env.BASE_URL || "http://localhost:4000";

// Every route the PublicTranslator considers "public" (not under
// /admin, /dashboard, /registrations, /crusades).
const PUBLIC_PAGES = [
  "/",
  "/crusade-registration",
  "/crusade-registration/register",
  "/blue-elite",
  "/blue-elite/register",
  "/report",
  "/resources",
  "/select-nation",
  "/media-training",
  "/mission-trips",
  "/upcoming-crusades",
  "/avatar",
];

// Mirror of PublicTranslator's textNodes() filter — same 600-char cap,
// same skip list. We collect the trimmed text so it matches what the
// translator caches as source_text.
async function extractTextNodes(page) {
  return page.evaluate(() => {
    const root = document.getElementById("root");
    if (!root) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        const text = node.nodeValue?.trim();
        if (
          !parent ||
          !text ||
          text.length > 600 ||
          parent.closest(
            "[data-page-translator], [translate='no'], script, style, noscript, textarea, input, code, pre"
          )
        )
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode.nodeValue.trim());
    return nodes;
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});

const allText = new Set();

for (const path of PUBLIC_PAGES) {
  const url = `${BASE}${path}`;
  process.stdout.write(`  ${path} ... `);
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    // Give late-rendering React effects (charts, lazy sections) a chance.
    await page.waitForTimeout(2500);

    // Expand any <details> / accordions so hidden text is captured.
    await page.evaluate(() => {
      document.querySelectorAll("details").forEach((d) => (d.open = true));
      document
        .querySelectorAll('[role="button"], button')
        .forEach((el) => {
          const text = el.textContent?.trim().toLowerCase() || "";
          if (
            text.includes("expand") ||
            text.includes("show") ||
            text.includes("more") ||
            text.includes("read") ||
            text.includes("view")
          )
            el.click();
        });
    });
    await page.waitForTimeout(800);

    const texts = await extractTextNodes(page);
    texts.forEach((t) => allText.add(t));
    process.stdout.write(`${texts.length} nodes\n`);
  } catch (err) {
    process.stdout.write(`ERROR: ${err.message}\n`);
  } finally {
    await page.close();
  }
}

await browser.close();

const sorted = [...allText].sort();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(sorted, null, 2));
process.stdout.write(`\nWrote ${sorted.length} unique strings to ${OUT}\n`);
