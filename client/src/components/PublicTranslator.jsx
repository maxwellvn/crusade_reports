import * as React from "react";
import { useLocation } from "react-router-dom";
import { Languages, Loader2 } from "lucide-react";
import { getJSON, postJSON } from "@/lib/api";

const ADMIN_PATHS = ["/admin", "/dashboard", "/registrations", "/crusades"];
const originals = new Map();
const translations = new Map();
function decode(value) {
  const textarea = document.createElement("textarea"); textarea.innerHTML = value; return textarea.value;
}

function textNodes() {
  const root = document.getElementById("root"); if (!root) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node) {
    const parent = node.parentElement; const text = node.nodeValue?.trim();
    if (!parent || !text || text.length > 600 || parent.closest("[data-page-translator], [translate='no'], script, style, noscript, textarea, input, code, pre, [role='combobox'], [cmdk-root], [data-radix-popper-content-wrapper], [data-combobox-trigger]")) return NodeFilter.FILTER_REJECT;
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
  const failedKey = React.useRef("");

  React.useEffect(() => {
    if (!isPublic) return;
    getJSON("/translation/languages").then((available) => {
      setLanguages(available);
    }).catch(() => {});
  }, [isPublic, storedLanguage]);

  const translatePage = React.useCallback(async () => {
    const id = ++request.current;
    for (const [node] of originals) { if (!node.isConnected) originals.delete(node); }
    if (!isPublic || language === "en") {
      for (const [node, original] of originals) if (node.isConnected && node.nodeValue !== original) node.nodeValue = original;
      setStatus("idle"); document.documentElement.lang = "en"; return;
    }
    const attemptKey = `${pathname}|${language}`;
    if (failedKey.current === attemptKey) return;
    const nodes = textNodes(); nodes.forEach((node) => { if (!originals.has(node)) originals.set(node, node.nodeValue); });
    const unique = [...new Set(nodes.map((node) => originals.get(node)?.trim()).filter(Boolean))];
    if (!unique.length) return;
    setStatus("loading");
    try {
      const missing = unique.filter((text) => !translations.has(`${language}\0${text}`));
      for (let start = 0; start < missing.length; start += 40) {
        const batch = missing.slice(start, start + 40);
        const result = await postJSON("/translation/translate", { target: language, texts: batch });
        if (id !== request.current) return;
        batch.forEach((text, index) => translations.set(`${language}\0${text}`, decode(result.translations[index])));
      }
      nodes.forEach((node) => { const original = originals.get(node); const leading = original.match(/^\s*/)?.[0] || ""; const trailing = original.match(/\s*$/)?.[0] || ""; const next = `${leading}${translations.get(`${language}\0${original.trim()}`) || original.trim()}${trailing}`; if (node.nodeValue !== next) node.nodeValue = next; });
      failedKey.current = "";
      document.documentElement.lang = language; setStatus("ready");
    } catch { if (id === request.current) { failedKey.current = attemptKey; setStatus("error"); } }
  }, [isPublic, language, pathname]);

  React.useEffect(() => {
    const timer = setTimeout(translatePage, 80);
    if (!isPublic) return () => clearTimeout(timer);
    let mutationTimer;
    const observer = new MutationObserver((records) => {
      if (!records.some((record) => !record.target.parentElement?.closest?.("[data-page-translator]"))) return;
      clearTimeout(mutationTimer); mutationTimer = setTimeout(translatePage, 250);
    });
    const root = document.getElementById("root"); if (root) observer.observe(root, { childList: true, subtree: true });
    return () => { clearTimeout(timer); clearTimeout(mutationTimer); observer.disconnect(); };
  }, [pathname, isPublic, translatePage]);

  if (!isPublic) return null;
  return <div data-page-translator translate="no" className="fixed left-4 z-[80] flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,.16)] print:hidden">
    {status === "loading" ? <Loader2 className="size-4 animate-spin text-blue-700" /> : <Languages className="size-4 text-blue-700" />}
    <label htmlFor="page-language" className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Language</label>
    <select id="page-language" value={language} onChange={(event) => { const next = event.target.value; localStorage.setItem("page-language", next); failedKey.current = ""; setLanguage(next); }} className="max-w-36 cursor-pointer bg-white text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:max-w-44">
      {languages.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
    </select>
    <span className="sr-only" aria-live="polite">{status === "loading" ? "Translating page" : status === "error" ? "Translation unavailable" : ""}</span>
  </div>;
}
