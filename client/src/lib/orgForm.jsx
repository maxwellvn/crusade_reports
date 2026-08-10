import * as React from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { getJSON } from "@/lib/api";

// Shared plumbing for the two multi-step forms (report + registration):
// zone/group/network/country/city fetchers, the stepper, and review summary rows.

// Fixed ministry departments that can collaborate on a crusade, alongside zones
// and networks. These are organizational units within the ministry, not zones or
// networks, so they live as a constant rather than in the zones/networks tables.
const MINISTRY_DEPARTMENTS = [
  "Innercity Missions",
  "Ministry of Children Affairs",
  "Church Ministry",
  "Ministry of Teens and Youths",
  "Cell Ministry",
];

const COUNTRY_ALIASES = {
  uk: "united kingdom", gb: "united kingdom", britain: "united kingdom", england: "united kingdom",
  usa: "united states", us: "united states", america: "united states",
  uae: "united arab emirates", emirates: "united arab emirates", holland: "netherlands",
  drc: "congo", burma: "myanmar", swaziland: "eswatini",
};

// zone: current zone value (group options depend on it).
// countryCode: ISO code of the picked country (city autocomplete is scoped to it).
export function useOrgData(zone, countryCode) {
  const [allCountries, setAllCountries] = React.useState([]);
  const [zones, setZones] = React.useState([]);
  const [networks, setNetworks] = React.useState([]);

  React.useEffect(() => {
    getJSON("/zones").then(setZones).catch(() => toast.error("Could not load zones"));
    getJSON("/networks").then(setNetworks).catch(() => toast.error("Could not load networks"));
    getJSON("/countries").then(setAllCountries).catch(() => toast.error("Could not load countries"));
  }, []);

  const fetchCountries = React.useCallback(async (q) => {
    const s = q.trim().toLowerCase();
    const alias = COUNTRY_ALIASES[s];
    return allCountries
      .filter((c) => { const n = c.name.toLowerCase(); return !s || n.includes(s) || (alias && n.includes(alias)); })
      .map((c) => ({ value: c.code, label: c.name }));
  }, [allCountries]);

  // Resolve a country name back to its ISO code — lets a per-crusade city search be
  // scoped to that crusade's own country without threading the code through state.
  const countryCodeOf = React.useCallback(
    (name) => allCountries.find((c) => c.name === name)?.code || "",
    [allCountries]
  );

  const fetchCities = React.useCallback(async (q) => {
    const r = await getJSON(`/places/autocomplete?input=${encodeURIComponent(q)}${countryCode ? `&country=${countryCode}` : ""}`);
    return r.map((p) => ({ value: p.place_id, label: p.main, sublabel: p.secondary }));
  }, [countryCode]);

  const fetchZones = React.useCallback(async (q) => {
    const currentZones = await getJSON("/zones");
    setZones(currentZones);
    return currentZones.filter((z) => z.zone.toLowerCase().includes(q.toLowerCase())).map((z) => ({ value: z.zone, label: z.zone, sublabel: z.region }));
  }, []);
  const fetchGroups = React.useCallback(async (q) => {
    if (!zone) return [];
    const groups = await getJSON(`/zones/groups?zone=${encodeURIComponent(zone)}`);
    return groups.filter((g) => g.name.toLowerCase().includes(q.toLowerCase())).map((g) => ({ value: g.id, label: g.name }));
  }, [zone]);
  const fetchNetworks = React.useCallback(
    async (q) => networks.filter((n) => n.name.toLowerCase().includes(q.toLowerCase())).map((n) => ({ value: n.name, label: n.name })),
    [networks]
  );
  // Crusade collaborators: every zone, every network, and the fixed ministry
  // departments, in one searchable list. Value is prefixed so a zone and a
  // network sharing a name stay distinct keys; the stored collaborator is the
  // plain name (option label).
  const fetchCollaborators = React.useCallback(async (q) => {
    const s = q.trim().toLowerCase();
    const match = (name) => !s || name.toLowerCase().includes(s);
    return [
      ...zones.filter((z) => match(z.zone)).map((z) => ({ value: `zone:${z.zone}`, label: z.zone, sublabel: "Zone" })),
      ...networks.filter((n) => match(n.name)).map((n) => ({ value: `network:${n.name}`, label: n.name, sublabel: "Network" })),
      ...MINISTRY_DEPARTMENTS.filter((name) => match(name)).map((name) => ({ value: `ministry:${name}`, label: name, sublabel: "Ministry" })),
    ];
  }, [zones, networks]);

  const clearGroupCache = React.useCallback(() => {}, []);

  return { fetchCountries, countryCodeOf, fetchCities, fetchZones, fetchGroups, fetchNetworks, fetchCollaborators, networks, setNetworks, clearGroupCache };
}

export function Stepper({ steps, step, compact = false }) {
  return (
    <ol className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-100/60">
      {steps.map((label, i) => {
        const state = i < step ? "done" : i === step ? "current" : "todo";
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span className={
              "grid size-7 shrink-0 place-items-center rounded-full border transition-all duration-300 ease-emphasized " +
              (state === "done" ? "border-primary bg-primary text-primary-foreground"
                : state === "current" ? "border-primary text-primary ring-[3px] ring-ring/15"
                : "border-muted-foreground/25 text-muted-foreground")
            }>
              {state === "done" ? <Check className="size-4" /> : <span className="text-xs font-semibold leading-none tabular-nums">{i + 1}</span>}
            </span>
            {/* on phones only the active step's label fits comfortably */}
            <span className={"text-sm font-medium transition-colors " + (state === "todo" ? "text-muted-foreground" : "text-foreground") + (compact ? " max-sm:hidden" : state === "current" ? "" : " max-sm:hidden")}>{label}</span>
            {i < steps.length - 1 && (
              <span className="mx-1 h-px flex-1 overflow-hidden rounded-full bg-border">
                <span className={"block h-full origin-left bg-primary transition-transform duration-300 ease-emphasized " + (i < step ? "scale-x-100" : "scale-x-0")} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function Summary({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold capitalize text-slate-800">{value}</div>
    </div>
  );
}
