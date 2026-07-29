import * as React from "react";
import { useLocation } from "react-router-dom";
import { Languages, Loader2 } from "lucide-react";
import { getJSON, postJSON } from "@/lib/api";

const ADMIN_PATHS = ["/admin", "/dashboard", "/registrations", "/crusades"];
const originals = new Map();
const COUNTRY_LANGUAGE = {};
[
  ["fr", "FR BE MC LU CD CG CI SN ML NE BF BJ TG GA GN DJ HT MG CM CF TD KM RW BI"],
  ["es", "ES MX AR BO CL CO CR CU DO EC SV GQ GT HN NI PA PY PE PR UY VE"],
  ["pt", "PT BR AO MZ GW CV ST TL"], ["ar", "SA AE DZ BH EG IQ JO KW LB LY MA MR OM PS QA SD SY TN YE"],
  ["de", "DE AT LI"], ["it", "IT SM VA"], ["nl", "NL SR"], ["ru", "RU BY KZ KG"],
  ["zh-CN", "CN SG"], ["zh-TW", "TW"], ["sw", "TZ KE UG"], ["en", "NG GB US CA AU NZ IE ZA GH GM LR SL ZM ZW BW NA SZ LS JM TT BB BS BZ GY MT FJ PG SB VU WS TO KI NR PW MH FM"],
  ["af", "ZA NA"], ["am", "ET"], ["bn", "BD"], ["bg", "BG"], ["hr", "HR"], ["cs", "CZ"],
  ["da", "DK"], ["fi", "FI"], ["el", "GR CY"], ["he", "IL"], ["hi", "IN"], ["hu", "HU"],
  ["id", "ID"], ["ja", "JP"], ["ko", "KR KP"], ["ms", "MY BN"], ["ne", "NP"], ["no", "NO"],
  ["fa", "IR AF"], ["pl", "PL"], ["ro", "RO MD"], ["sr", "RS ME"], ["sk", "SK"], ["so", "SO"],
  ["sv", "SE"], ["th", "TH"], ["tr", "TR"], ["uk", "UA"], ["ur", "PK"], ["vi", "VN"],
].forEach(([language, countries]) => countries.split(" ").forEach((country) => { COUNTRY_LANGUAGE[country] = language; }));

function decode(value) {
  const textarea = document.createElement("textarea"); textarea.innerHTML = value; return textarea.value;
}

function textNodes() {
  const root = document.getElementById("root"); if (!root) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node) {
    const parent = node.parentElement; const text = node.nodeValue?.trim();
    if (!parent || !text || text.length > 600 || parent.closest("[data-page-translator], [translate='no'], script, style, noscript, textarea, input, code, pre")) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  } });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode); return nodes;
}

export function PublicTranslator() {
  const { pathname } = useLocation();
  const isPublic = !ADMIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const [languages, setLanguages] = React.useState([{ code: "en", name: "English" }]);
  const storedLanguage = React.useMemo(() => localStorage.getItem("page-language"), []);
  const [language, setLanguage] = React.useState(() => storedLanguage || "en");
  const [status, setStatus] = React.useState("idle");
  const request = React.useRef(0);

  React.useEffect(() => {
    if (!isPublic) return;
    getJSON("/translation/languages").then(async (available) => {
      setLanguages(available);
      if (storedLanguage) return;
      const supported = new Set(available.map(({ code }) => code));
      const location = await getJSON("/translation/location").catch(() => ({ country_code: "" }));
      const country = String(location.country_code || "").toUpperCase();
      if (country === "NG") return setLanguage("en");
      const localeLanguage = navigator.language?.split("-")[0];
      const automatic = COUNTRY_LANGUAGE[country] || (supported.has(localeLanguage) ? localeLanguage : "en");
      setLanguage(supported.has(automatic) ? automatic : "en");
    }).catch(() => {});
  }, [isPublic, storedLanguage]);

  const translatePage = React.useCallback(async () => {
    const id = ++request.current;
    for (const [node, original] of originals) { if (node.isConnected) node.nodeValue = original; else originals.delete(node); }
    if (!isPublic || language === "en") { setStatus("idle"); document.documentElement.lang = "en"; return; }
    const nodes = textNodes(); nodes.forEach((node) => { if (!originals.has(node)) originals.set(node, node.nodeValue); });
    const unique = [...new Set(nodes.map((node) => originals.get(node)?.trim()).filter(Boolean))];
    if (!unique.length) return;
    setStatus("loading");
    try {
      const translated = new Map();
      for (let start = 0; start < unique.length; start += 40) {
        const batch = unique.slice(start, start + 40);
        const result = await postJSON("/translation/translate", { target: language, texts: batch });
        if (id !== request.current) return;
        batch.forEach((text, index) => translated.set(text, decode(result.translations[index])));
      }
      nodes.forEach((node) => { const original = originals.get(node); const leading = original.match(/^\s*/)?.[0] || ""; const trailing = original.match(/\s*$/)?.[0] || ""; node.nodeValue = `${leading}${translated.get(original.trim()) || original.trim()}${trailing}`; });
      document.documentElement.lang = language; setStatus("ready");
    } catch { if (id === request.current) setStatus("error"); }
  }, [isPublic, language]);

  React.useEffect(() => {
    const timer = setTimeout(translatePage, 80);
    if (!isPublic) return () => clearTimeout(timer);
    let mutationTimer;
    const observer = new MutationObserver(() => { clearTimeout(mutationTimer); mutationTimer = setTimeout(translatePage, 180); });
    const root = document.getElementById("root"); if (root) observer.observe(root, { childList: true, subtree: true });
    return () => { clearTimeout(timer); clearTimeout(mutationTimer); observer.disconnect(); };
  }, [pathname, isPublic, translatePage]);

  if (!isPublic) return null;
  return <div data-page-translator translate="no" className="fixed bottom-4 left-4 z-[80] flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,.16)] print:hidden">
    {status === "loading" ? <Loader2 className="size-4 animate-spin text-blue-700" /> : <Languages className="size-4 text-blue-700" />}
    <label htmlFor="page-language" className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Language</label>
    <select id="page-language" value={language} onChange={(event) => { const next = event.target.value; localStorage.setItem("page-language", next); setLanguage(next); }} className="max-w-36 cursor-pointer bg-white text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:max-w-44">
      {languages.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
    </select>
    <span className="sr-only" aria-live="polite">{status === "loading" ? "Translating page" : status === "error" ? "Translation unavailable" : ""}</span>
  </div>;
}
