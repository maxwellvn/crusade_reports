import * as React from "react";
import simpleheat from "simpleheat";
import { CRUSADE_TYPES, CORE_OUTCOMES, EXTENDED_OUTCOMES } from "@/lib/constants";
import { DOTS, CENTROIDS } from "@/lib/worldDots";

export const DATA_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#db2777"];
export const nf = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const nfull = new Intl.NumberFormat("en");
export const typeLabel = (v) => v === "cellular" ? "Rabah Cellular Outreach" : CRUSADE_TYPES.find(([c]) => c === v)?.[1] || v;
export const OUTCOME_LABELS = Object.fromEntries([...CORE_OUTCOMES, ...EXTENDED_OUTCOMES]);

// ---- Chart primitives -------------------------------------------------------

// Bare stat cell — the KPI slab in Dashboard supplies the hairline dividers.
export function StatTile({ label, value, sub }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="stat-value mt-1 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">{value ?? "—"}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// Horizontal bars: thin marks, 4px rounded data-end, direct value labels — all
// info visible, so no tooltip layer needed.
export function BarH({ rows, max: maxRows = 8, expanded, onRowClick }) {
  const shown = expanded ? rows : rows.slice(0, maxRows);
  const top = Math.max(...shown.map((r) => r.value), 1);
  if (!rows.length) return <Empty />;
  return (
    <div className="space-y-2.5">
      {shown.map((r, index) => (
        <div key={r.label} className={onRowClick ? "cursor-pointer" : ""} onClick={() => onRowClick?.(r)}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground" title={nfull.format(r.value)}>
              {nf.format(r.value)}{r.sub ? <span className="ml-1.5 text-xs">· {r.sub}</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-r-[4px]" style={{ width: r.value ? `${Math.max((r.value / top) * 100, 1.5)}%` : 0, background: DATA_COLORS[index % DATA_COLORS.length] }} />
          </div>
        </div>
      ))}
      {!expanded && rows.length > shown.length && (
        <p className="pt-1 text-xs text-muted-foreground">+ {rows.length - shown.length} more — expand to see all</p>
      )}
    </div>
  );
}

export function Empty({ text = "No data yet — submit a report to see this." }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

// KPI slab: one card, hairline-divided stat cells. stats = [[label, value], ...]
export function StatSlab({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
      {stats.map(([label, value], index) => (
        <div key={label} className="bg-card p-4">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums" style={{ color: DATA_COLORS[index % DATA_COLORS.length] }}>{nfull.format(value || 0)}</div>
        </div>
      ))}
    </div>
  );
}

// ---- Geography map ----------------------------------------------------------

// DB country names (Google Places) → geojson names where they differ.
const GEO_ALIASES = {
  "united states": "united states of america", usa: "united states of america",
  tanzania: "united republic of tanzania", serbia: "republic of serbia",
  "north macedonia": "macedonia", "czechia": "czech republic",
  "côte d'ivoire": "ivory coast", "cote d'ivoire": "ivory coast",
  congo: "democratic republic of the congo",
  eswatini: "swaziland", "timor-leste": "east timor", "the bahamas": "bahamas",
  "guinea-bissau": "guinea bissau",
};

// Dot-matrix world map with per-country markers. Hover = stats tooltip,
// click = drill to the filtered crusades table. Equirect x/y baked in worldDots.
// ponytail: no pan/zoom — a world map at card size doesn't need it; add Leaflet if it ever does.
// worldDots y is 0–100 over 131° of latitude; scale to true equirect aspect so circles stay circles.
const MAP_Y = 36.4 / 100; // (131° / 360°) × 100 viewBox-width units
const MAP_H = 36.4;
const LAND_PATH = DOTS.map(([x, y]) => `M${x} ${(y * MAP_Y).toFixed(1)}h.01`).join("");

// lat/lng → the same equirect x/y space as worldDots (x 0–100, y 0–100 over 75°N–56°S)
const project = (lat, lng) => (lat > 75 || lat < -56 ? null : [(lng + 180) / 3.6, ((75 - lat) / 131) * 100]);

export function GeoMap({ rows, cities, onSelect, emptyText }) {
  const [hover, setHover] = React.useState(null);
  const [mode, setMode] = React.useState(() => localStorage.getItem("geo-map-mode") || "dots");
  const pickMode = (m) => { setMode(m); localStorage.setItem("geo-map-mode", m); };
  const canvasRef = React.useRef(null);
  const data = (rows || [])
    .map((r) => {
      const k = (r.key || "").toLowerCase();
      return { ...r, pos: CENTROIDS[GEO_ALIASES[k] || k], reach: (r.attendance || 0) + (r.online_attendance || 0) };
    })
    .filter((r) => r.pos);
  // Real geocoded city points — exact coordinates, so heat stays inside city margins.
  // key stays the country for drill-down; label carries the city for the tooltip.
  const cityData = (cities || [])
    .map((c) => ({ ...c, key: c.country, label: `${c.key}, ${c.country}`, pos: project(c.lat, c.lng), reach: (c.attendance || 0) + (c.online_attendance || 0) }))
    .filter((c) => c.pos);
  const top = Math.max(...data.map((r) => r.reach), 1);

  // Heat layer: simpleheat blends grayscale blobs additively, then colorizes
  // through a gradient LUT — the classic green→yellow→red intensity look.
  React.useEffect(() => {
    const cv = canvasRef.current;
    if (mode !== "heat" || !cv || !data.length) return;
    const draw = () => {
      const w = cv.offsetWidth, h = cv.offsetHeight;
      if (!w) return;
      cv.width = w; cv.height = h;
      const heat = simpleheat(cv);
      const px = (p) => [(p[0] / 100) * w, ((p[1] * MAP_Y) / MAP_H) * h];
      const pts = [];
      if (cityData.length) {
        // One point per real city — intensity anchored to actual coordinates.
        const cityTop = Math.max(...cityData.map((c) => c.reach), 1);
        cityData.forEach((c) => {
          const [x, y] = px(c.pos);
          pts.push([x, y, 0.35 + 0.65 * Math.sqrt(c.reach / cityTop)]); // floor keeps low activity visible
        });
      } else {
        // Fallback (no geocoded rows yet): tight deterministic scatter around
        // country centroids — golden-angle spiral, no shimmer.
        data.forEach((r) => {
          const t = Math.sqrt(r.reach / top);
          const n = 6 + Math.round(t * 18);
          const spread = ((1 + t * 2.5) / 100) * w;
          const [cx, cy] = px(r.pos);
          for (let i = 0; i < n; i++) {
            const a = i * 2.399963;
            const d = spread * Math.sqrt((i + 0.5) / n);
            pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, (0.35 + 0.65 * t) * (1 - 0.4 * (i / n))]);
          }
        });
      }
      heat.data(pts);
      heat.max(1.2); // only genuinely dense cores saturate to red
      heat.gradient({ 0.3: "#22c55e", 0.55: "#84cc16", 0.75: "#eab308", 1: "#dc2626" });
      heat.radius(Math.max(w * 0.014, 7), Math.max(w * 0.012, 6));
      heat.draw(0.08);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [mode, rows, cities]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data.length) return <Empty text={emptyText} />;
  return (
    <div>
      <div className="mb-2 flex justify-end gap-3 text-sm font-semibold">
        {[["dots", "Dots"], ["heat", "Heat"]].map(([m, label]) => (
          <button key={m} type="button" onClick={() => pickMode(m)}
            className={m === mode ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground transition-colors hover:text-foreground"}>
            {label}
          </button>
        ))}
      </div>
      <div className="relative">
      <svg viewBox={`0 0 100 ${MAP_H}`} className="w-full" role="img" aria-label="Crusades by country">
        {/* land as one path — 5.8k dots, one DOM node */}
        <path d={LAND_PATH} stroke="hsl(0 0% 62%)" strokeWidth="0.28" strokeLinecap="round" fill="none" opacity="0.6" />
        {(mode === "heat" && cityData.length ? cityData : data).map((r) => (
          <circle key={r.label || r.key} cx={r.pos[0]} cy={r.pos[1] * MAP_Y}
            r={mode === "heat" ? 1.6 : 0.7 + (r.reach / top) * 1.1}
            className={mode === "heat" ? "cursor-pointer fill-transparent" : "cursor-pointer fill-blue-600 transition-[r]"}
            stroke={mode === "heat" ? "none" : "hsl(0 0% 100%)"} strokeWidth="0.25"
            onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)} onClick={() => onSelect?.(r)} />
        ))}
      </svg>
      {mode === "heat" && (
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
      )}
      {hover && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground"
          style={{ left: `${hover.pos[0]}%`, top: `${hover.pos[1] - 3}%` }}>
          <span className="font-semibold">{hover.label || hover.key}</span>
          <span className="ml-1.5 opacity-80">
            {nfull.format(hover.crusades || 0)} crusade{hover.crusades === 1 ? "" : "s"} · {nf.format(hover.reach)} reached
            {hover.salvation ? ` · ${nf.format(hover.salvation)} saved` : ""}
          </span>
        </div>
      )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {mode === "heat" ? (
          <span className="flex items-center gap-1.5">
            Low
            <span aria-hidden="true" className="h-2 w-24 rounded-full"
              style={{ background: "linear-gradient(90deg, #22c55e, #84cc16, #eab308, #dc2626)" }} />
            High · spread = total reach.
          </span>
        ) : (
          <span>Marker size = total reach.</span>
        )}
        <span>Hover for stats, click to see that country’s crusades.</span>
      </div>
    </div>
  );
}

// ---- Widget registry --------------------------------------------------------

// Bar value = total reach (onsite + online attendance).
export const asBars = (rows, labelFn = (k) => k) =>
  (rows || []).map((r) => ({ label: labelFn(r.key) || "—", value: (r.attendance || 0) + (r.online_attendance || 0), sub: `${r.crusades} crusade${r.crusades === 1 ? "" : "s"}`, key: r.key }));

const titleCase = (k) => k && k[0].toUpperCase() + k.slice(1);

export const orgHierarchy = (row) => row.network_name
  ? `Network: ${row.network_name}`
  : [["Zone", row.zone], ["Group", row.group_name], ["Church", row.church_name], ["Cell", row.cell_name]]
    .filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join(" › ") || titleCase(row.organization_type) || "—";

// Breakdown widgets map to a stats array + a /api/crusades filter field, so
// "Expand" can open a full drill-down page and each row can jump to the
// matching filtered rows in the table. Single-number tiles and the trend/recent
// widgets have no further breakdown, so they're left out of this map on purpose.
export const DRILL_MAP = {
  zones: { statKey: "by_zone", filterField: "zone", labelFn: (k) => k },
  groups: { statKey: "by_group", filterField: "group_name", labelFn: (k) => k },
  churches: { statKey: "by_church", filterField: "church_name", labelFn: (k) => k },
  cells: { statKey: "by_cell", filterField: "cell_name", labelFn: (k) => k },
  networks: { statKey: "by_network", filterField: "network_name", labelFn: (k) => k },
  org_type: { statKey: "by_org_type", filterField: "organization_type", labelFn: titleCase },
  format: { statKey: "by_format", filterField: "format", labelFn: titleCase },
  types: { statKey: "by_category", filterField: "event_type", labelFn: typeLabel },
  countries: { statKey: "by_country", filterField: "country", labelFn: (k) => k },
  map: { statKey: "by_country", filterField: "country", labelFn: (k) => k },
  cities: { statKey: "by_city", filterField: "city", labelFn: (k) => k },
};

// Single-stat KPI tiles. Each is its own widget so it can be individually
// added/removed — nothing is bundled into one fixed "Overview" block.
const KPI_WIDGETS = {
  reports: { title: "Total Reports", render: (s) => <StatTile label="Total Reports" value={nfull.format(s.reports || 0)} /> },
  crusades: { title: "Total Crusades", render: (s) => <StatTile label="Total Crusades" value={nfull.format(s.totals.crusades || 0)} sub="Actual crusades held" /> },
  onsite_attendance: { title: "Total Onsite Attendance", render: (s) => <StatTile label="Total Onsite Attendance" value={nfull.format(s.totals.attendance || 0)} /> },
  online_attendance: { title: "Total Online Attendance", render: (s) => <StatTile label="Total Online Attendance" value={nfull.format(s.totals.online_participation || 0)} /> },
  salvations: { title: "Total Souls Won", render: (s) => <StatTile label="Total Souls Won" value={nfull.format(s.totals.salvation || 0)} /> },
  holy_spirit_filled: { title: "Filled with Holy Spirit", render: (s) => <StatTile label="Filled with Holy Spirit" value={nfull.format(s.totals.holy_spirit_filled || 0)} /> },
  water_baptisms: { title: "Water Baptisms", render: (s) => <StatTile label="Water Baptisms" value={nfull.format(s.totals.water_baptisms || 0)} /> },
  ror_distributed: { title: "Rhapsody Distributed", render: (s) => <StatTile label="Rhapsody Distributed" value={nfull.format(s.totals.ror_distributed || 0)} /> },
  bibles_distributed: { title: "Rhapsody Bibles Distributed", render: (s) => <StatTile label="Rhapsody Bibles Distributed" value={nfull.format(s.totals.bibles_distributed || 0)} /> },
  radio_tv_reach: { title: "Estimated Radio/TV Reach", render: (s) => <StatTile label="Estimated Radio/TV Reach" value={nfull.format(s.totals.radio_tv_reach || 0)} /> },
  testimonies_recorded: { title: "Testimonies Recorded", render: (s) => <StatTile label="Testimonies Recorded" value={nfull.format(s.totals.testimonies_recorded || 0)} /> },
  tap2read_distributed: { title: "TAP2read Distributed", render: (s) => <StatTile label="TAP2read Distributed" value={nfull.format(s.totals.tap2read_distributed || 0)} /> },
  ntyba_distributed: { title: "Now That You're Born Again Distributed", render: (s) => <StatTile label="Now That You're Born Again Distributed" value={nfull.format(s.totals.ntyba_distributed || 0)} /> },
  healing_nations_magazine: { title: "Healing to the Nations Magazine", render: (s) => <StatTile label="Healing to the Nations Magazine" value={nfull.format(s.totals.healing_nations_magazine || 0)} /> },
  physical_crusades: {
    title: "Physical Crusades",
    render: (s) => <StatTile label="Physical Crusades" value={nfull.format(s.by_format?.find((r) => r.key === "physical")?.crusades || 0)} sub="Onsite/physical events held" />,
  },
  online_crusades: {
    title: "Online Crusades",
    render: (s) => <StatTile label="Online Crusades" value={nfull.format(s.by_format?.find((r) => r.key === "online")?.crusades || 0)} sub="Fully virtual events held" />,
  },
  countries_covered: { title: "Countries Covered", render: (s) => <StatTile label="Countries Covered" value={nfull.format(s.totals?.countries || 0)} /> },
  registered: {
    title: "Crusades Registered",
    render: (s) => <StatTile label="Crusades Registered" value={nfull.format(s.registered?.total || 0)}
      sub={`${nfull.format(s.registered?.reported || 0)} reported as held`} />,
  },
  registered_reported: {
    title: "Registered Crusades Held",
    render: (s) => <StatTile label="Registered Crusades Held" value={nfull.format(s.registered?.reported || 0)} sub="Reports linked to registrations" />,
  },
  awaiting_reports: {
    title: "Awaiting Reports",
    render: (s) => <StatTile label="Awaiting Reports" value={nfull.format(s.registered?.awaiting || 0)} sub="Registered crusades without reports" />,
  },
};

// Planned (registrations) vs held (reports): a progress bar per key.
function PlannedVsHeld({ rows = [], labelFn = (k) => k, expanded, onRowClick }) {
  if (!rows.length) return <Empty text="No registrations yet — planned totals appear once organizations register." />;
  const shown = expanded ? rows : rows.slice(0, 8);
  return (
    <div className="space-y-2.5">
      {shown.map((r) => (
        <div key={r.key} className={onRowClick ? "cursor-pointer" : ""} onClick={() => onRowClick?.(r)}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate capitalize">{labelFn(r.key)}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {nf.format(r.held)} of {nf.format(r.planned)} held
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-r-[4px] bg-emerald-500"
              style={{ width: `${Math.min((r.held / Math.max(r.planned, 1)) * 100, 100)}%` }} />
          </div>
        </div>
      ))}
      {!expanded && rows.length > shown.length && (
        <p className="pt-1 text-xs text-muted-foreground">+ {rows.length - shown.length} more — expand to see all</p>
      )}
    </div>
  );
}

const BREAKDOWN_WIDGETS = {
  map: { title: "Geography", size: 2, render: (s, x, onRowClick) => <GeoMap rows={s.by_country} cities={s.geo} onSelect={onRowClick} /> },
  planned_vs_held_type: { title: "Planned vs held — by type", registrationFilter: "event_type", render: (s, x, go) => <PlannedVsHeld rows={s.registered?.by_type} labelFn={typeLabel} expanded={x} onRowClick={go} /> },
  planned_vs_held_zone: { title: "Planned vs held — by zone", registrationFilter: "zone", render: (s, x, go) => <PlannedVsHeld rows={s.registered?.by_zone} expanded={x} onRowClick={go} /> },
  planned_vs_held_network: { title: "Planned vs held — by network", registrationFilter: "network_name", render: (s, x, go) => <PlannedVsHeld rows={s.registered?.by_network} expanded={x} onRowClick={go} /> },
  planned_vs_held_org_type: { title: "Planned vs held — by registration level", registrationFilter: "organization_type", render: (s, x, go) => <PlannedVsHeld rows={s.registered?.by_org_type} labelFn={titleCase} expanded={x} onRowClick={go} /> },
  planned_vs_held_country: { title: "Planned vs held — by country", registrationFilter: "country", render: (s, x, go) => <PlannedVsHeld rows={s.registered?.by_country} expanded={x} onRowClick={go} /> },
  planned_vs_held_city: { title: "Planned vs held — by city", registrationFilter: "city", render: (s, x, go) => <PlannedVsHeld rows={s.registered?.by_city} expanded={x} onRowClick={go} /> },
  zones: { title: "By zone", render: (s, x, onRowClick) => <BarH rows={asBars(s.by_zone)} expanded={x} onRowClick={onRowClick} /> },
  groups: { title: "By group", render: (s, x, onRowClick) => <BarH rows={asBars(s.by_group)} expanded={x} onRowClick={onRowClick} /> },
  churches: { title: "By church", render: (s, x, onRowClick) => <BarH rows={asBars(s.by_church)} expanded={x} onRowClick={onRowClick} /> },
  cells: { title: "By cell", render: (s, x, onRowClick) => <BarH rows={asBars(s.by_cell)} expanded={x} onRowClick={onRowClick} /> },
  networks: { title: "By network", render: (s, x, onRowClick) => <BarH rows={asBars(s.by_network)} expanded={x} onRowClick={onRowClick} /> },
  org_type: { title: "By reporting level", render: (s, x, onRowClick) => <BarH rows={asBars(s.by_org_type, titleCase)} expanded={x} onRowClick={onRowClick} /> },
  format: { title: "Physical vs online", render: (s, x, onRowClick) => <BarH rows={asBars(s.by_format, titleCase)} expanded={x} onRowClick={onRowClick} /> },
  types: { title: "By crusade type", render: (s, x, onRowClick) => <BarH rows={asBars(s.by_category, typeLabel)} expanded={x} onRowClick={onRowClick} /> },
  countries: { title: "By country", render: (s, x, onRowClick) => <BarH rows={asBars(s.by_country)} expanded={x} onRowClick={onRowClick} /> },
  cities: { title: "Top cities", render: (s, x, onRowClick) => <BarH rows={asBars(s.by_city)} expanded={x} onRowClick={onRowClick} /> },
  outcomes: {
    title: "Outcomes breakdown", render: (s, x) => (
      <BarH expanded={x} rows={Object.entries(OUTCOME_LABELS)
        .map(([k, label]) => ({ label, value: s.totals[k] || 0 }))
        .sort((a, b) => b.value - a.value)} />
    ),
  },
  recent: {
    title: "Recent reports", size: 2,
    render: (s) => !s.recent?.length ? <Empty /> : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">#</th><th className="py-2 pr-3 font-medium">From</th>
              <th className="py-2 pr-3 font-medium">Country</th><th className="py-2 pr-3 text-right font-medium">Crusades</th>
              <th className="py-2 pr-3 text-right font-medium">Attendance</th><th className="py-2 text-right font-medium">Salvations</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {s.recent.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2 pr-3 text-muted-foreground">{r.id}</td>
                <td className="max-w-80 py-2 pr-3 text-xs">{orgHierarchy(r)}</td>
                <td className="py-2 pr-3">{r.country}</td>
                <td className="py-2 pr-3 text-right">{r.crusades}</td>
                <td className="py-2 pr-3 text-right">{nfull.format(r.attendance || 0)}</td>
                <td className="py-2 text-right">{nfull.format(r.salvation || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
};

export const WIDGETS = { ...KPI_WIDGETS, ...BREAKDOWN_WIDGETS };
export const KPI_IDS = new Set(Object.keys(KPI_WIDGETS));
export const DEFAULT_LAYOUT = Object.keys(WIDGETS).map((id) => ({ id, expanded: false }));
