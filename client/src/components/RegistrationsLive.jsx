import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileDown, FileText, GripVertical, Maximize2, Minimize2, Plus, Radio, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton, LoadingRows } from "@/components/ui/skeleton";
import { getJSON, putJSON } from "@/lib/api";
import { GeoMap, BarH, nfull, orgHierarchy, typeLabel, Empty, StatTile } from "@/lib/dashboardWidgets";
import { groupByContinent } from "@/lib/continents";

const POLL_MS = 10000;
const LS_KEY = "crusades-live-registrations-v1";
const KPI_TONES = {
  planned: "bg-blue-50/80 [&_.stat-value]:!text-blue-700",
  organizations: "bg-violet-50/80 [&_.stat-value]:!text-violet-700",
  zones_count: "bg-violet-50/80 [&_.stat-value]:!text-violet-700",
  groups_count: "bg-fuchsia-50/80 [&_.stat-value]:!text-fuchsia-700",
  churches_count: "bg-purple-50/80 [&_.stat-value]:!text-purple-700",
  cells_count: "bg-pink-50/80 [&_.stat-value]:!text-pink-700",
  networks_count: "bg-rose-50/80 [&_.stat-value]:!text-rose-700",
  cities_count: "bg-sky-50/80 [&_.stat-value]:!text-sky-700",
  expected_attendance: "bg-cyan-50/80 [&_.stat-value]:!text-cyan-700",
  countries_count: "bg-indigo-50/80 [&_.stat-value]:!text-indigo-700",
  continents_count: "bg-blue-50/80 [&_.stat-value]:!text-blue-700",
  confirmed: "bg-teal-50/80 [&_.stat-value]:!text-teal-700",
  reports_submitted: "bg-green-50/80 [&_.stat-value]:!text-green-700",
  awaiting_reports: "bg-amber-50/90 [&_.stat-value]:!text-amber-700",
};
const READINESS_LABELS = {
  confirmed: "Confirmed", pending: "Pending confirmation", preparing: "Preparing", ready: "Ready",
  holding: "Holding as planned", held: "Held", not_holding: "Not holding",
};
const titleCase = (value) => value ? value[0].toUpperCase() + value.slice(1) : "—";
const bars = (rows, label = (value) => value) => (rows || []).map((row) => ({
  key: row.key, label: label(row.key), value: row.planned || 0, sub: `${row.planned || 0} crusade${(row.planned || 0) === 1 ? "" : "s"}`,
}));
const docDate = new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function downloadWordDoc(filename, html) {
  const blob = new Blob([`\ufeff${html}`], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCountryRegistrationsReport(data) {
  const rows = [...(data.by_country || [])].sort((a, b) => (b.planned || 0) - (a.planned || 0));
  const totalCrusades = rows.reduce((sum, row) => sum + (row.planned || 0), 0);
  const totalRegistrations = rows.reduce((sum, row) => sum + (row.registrations || 0), 0);
  const generatedAt = docDate.format(new Date());
  const tableRows = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.key || "Unspecified")}</td>
      <td class="num">${nfull.format(row.planned || 0)}</td>
      <td class="num">${nfull.format(row.registrations || 0)}</td>
    </tr>
  `).join("");
  downloadWordDoc(`registrations-by-country-${new Date().toISOString().slice(0, 10)}.doc`, `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Registrations by Country</title>
        <style>
          @page { margin: 0.65in; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.45; }
          .eyebrow { color: #1d4ed8; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
          h1 { margin: 6px 0 4px; font-size: 24px; color: #0f172a; }
          .meta { margin: 0 0 22px; color: #475569; font-size: 12px; }
          .summary { width: 100%; border-collapse: collapse; margin: 0 0 22px; }
          .summary td { border: 1px solid #cbd5e1; padding: 10px 12px; }
          .summary .label { color: #475569; font-size: 11px; text-transform: uppercase; }
          .summary .value { display: block; margin-top: 4px; font-size: 18px; font-weight: 700; color: #1d4ed8; }
          table.report { width: 100%; border-collapse: collapse; font-size: 12px; }
          .report th { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; padding: 9px 10px; text-align: left; }
          .report td { border: 1px solid #dbe4ef; padding: 8px 10px; }
          .report tr:nth-child(even) td { background: #f8fafc; }
          .num { text-align: right; font-variant-numeric: tabular-nums; }
          .footer { margin-top: 20px; color: #64748b; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="eyebrow">Crusade registrations report</div>
        <h1>Registrations by Country</h1>
        <p class="meta">Generated ${escapeHtml(generatedAt)} from the live registrations dashboard.</p>
        <table class="summary">
          <tr>
            <td><span class="label">Countries represented</span><span class="value">${nfull.format(rows.length)}</span></td>
            <td><span class="label">Registered crusades</span><span class="value">${nfull.format(totalCrusades)}</span></td>
            <td><span class="label">Registration entries</span><span class="value">${nfull.format(totalRegistrations)}</span></td>
          </tr>
        </table>
        <table class="report">
          <thead><tr><th style="width: 48px;">#</th><th>Country</th><th class="num">Registered crusades</th><th class="num">Registration entries</th></tr></thead>
          <tbody>${tableRows || `<tr><td colspan="4">No country registrations available.</td></tr>`}</tbody>
        </table>
        <p class="footer">Prepared for internal campaign tracking and operational reporting.</p>
      </body>
    </html>
  `);
}

function timeAgo(sqliteUtc) {
  const s = Math.max(0, (Date.now() - new Date(sqliteUtc.replace(" ", "T") + "Z")) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const LIVE_WIDGETS = {
  planned: { title: "Crusades planned", kpi: true, filter: {}, render: (d) => <StatTile label="Crusades planned" value={nfull.format(d.totals.planned)} /> },
  organizations: { title: "Crusades", kpi: true, filter: {}, render: (d) => <StatTile label="Crusades" value={nfull.format(d.totals.planned)} /> },
  zones_count: { title: "Zone crusades", kpi: true, filter: { organization_type: "zone" }, render: (d) => <StatTile label="Zone crusades" value={nfull.format(d.totals.zone_crusades)} /> },
  groups_count: { title: "Group crusades", kpi: true, filter: { organization_type: "group" }, render: (d) => <StatTile label="Group crusades" value={nfull.format(d.totals.group_crusades)} /> },
  churches_count: { title: "Church crusades", kpi: true, filter: { organization_type: "church" }, render: (d) => <StatTile label="Church crusades" value={nfull.format(d.totals.church_crusades)} /> },
  cells_count: { title: "Cell crusades", kpi: true, filter: { organization_type: "cell" }, render: (d) => <StatTile label="Cell crusades" value={nfull.format(d.totals.cell_crusades)} /> },
  networks_count: { title: "Network crusades", kpi: true, filter: { organization_type: "network" }, render: (d) => <StatTile label="Network crusades" value={nfull.format(d.totals.network_crusades)} /> },
  countries_count: { title: "Countries", kpi: true, filter: {}, render: (d) => <StatTile label="Countries" value={nfull.format(d.totals.countries)} /> },
  continents_count: { title: "Continents", kpi: true, filter: {}, render: (d) => <StatTile label="Continents" value={nfull.format(groupByContinent(d.by_country).length)} /> },
  cities_count: { title: "Cities", kpi: true, filter: {}, render: (d) => <StatTile label="Cities" value={nfull.format(d.totals.cities)} /> },
  expected_attendance: { title: "Expected attendance", kpi: true, filter: {}, render: (d) => <StatTile label="Expected attendance" value={nfull.format(d.totals.expected_attendance)} /> },
  confirmed: { title: "Confirmed crusades", kpi: true, filter: { readiness_status: "confirmed" }, render: (d) => <StatTile label="Confirmed crusades" value={nfull.format(d.totals.confirmed)} /> },
  reports_submitted: { title: "Reports submitted", kpi: true, filter: { report_status: "reported" }, render: (d) => <StatTile label="Reports submitted" value={nfull.format(d.totals.reported)} /> },
  awaiting_reports: { title: "Awaiting reports", kpi: true, filter: { report_status: "unreported" }, render: (d) => <StatTile label="Awaiting reports" value={nfull.format(Math.max(d.totals.awaiting, 0))} /> },
  coverage: {
    title: "Registration coverage", size: 2,
    render: (d, _x, go) => <GeoMap
      rows={d.by_country.map((row) => ({ key: row.key, attendance: row.planned, crusades: row.registrations }))}
      cities={d.geo.map((city) => ({ key: city.key, country: city.country, lat: city.lat, lng: city.lng, attendance: city.planned, crusades: city.planned }))}
      onSelect={(row) => go("country", row.key)} emptyText="The map lights up as registrations arrive." />,
  },
  recent: {
    title: "As they happen", size: 2,
    render: (d, _x, go) => !d.recent.length ? <Empty text="No registrations yet — they’ll appear here live." /> : (
      <ul className="divide-y">
        {d.recent.map((row) => (
          <li key={row.id} onClick={() => go("q", row.org)} className="flex cursor-pointer items-baseline justify-between gap-3 py-2.5 hover:bg-accent/50">
            <div className="min-w-0"><p className="text-sm font-medium">{orgHierarchy(row)}</p><p className="text-xs text-muted-foreground">{row.country} · plan date {row.plan_date}</p></div>
            <div className="shrink-0 text-right"><p className="text-sm font-semibold tabular-nums">{nfull.format(row.planned)}</p><p className="text-xs text-muted-foreground">{timeAgo(row.created_at)}</p></div>
          </li>
        ))}
      </ul>
    ),
  },
  types: { title: "Planned by crusade type", filter: "event_type", render: (d, x, go) => <BarH rows={bars(d.by_type, typeLabel)} expanded={x} onRowClick={(row) => go("event_type", row.key)} /> },
  countries: { title: "Registrations by country", filter: "country", render: (d, x, go) => <BarH rows={bars(d.by_country)} expanded={x} onRowClick={(row) => go("country", row.key)} /> },
  continents: { title: "Crusades by continent", render: (d, x) => <BarH rows={bars(groupByContinent(d.by_country))} expanded={x} /> },
  zones: { title: "Registrations by zone", filter: "zone", render: (d, x, go) => <BarH rows={bars(d.by_zone)} expanded={x} onRowClick={(row) => go("zone", row.key)} /> },
  groups: { title: "Registrations by group", filter: "group_name", render: (d, x, go) => <BarH rows={bars(d.by_group)} expanded={x} onRowClick={(row) => go("group_name", row.key)} /> },
  churches: { title: "Registrations by church", filter: "church_name", render: (d, x, go) => <BarH rows={bars(d.by_church)} expanded={x} onRowClick={(row) => go("church_name", row.key)} /> },
  cells: { title: "Registrations by cell", filter: "cell_name", render: (d, x, go) => <BarH rows={bars(d.by_cell)} expanded={x} onRowClick={(row) => go("cell_name", row.key)} /> },
  networks: { title: "Registrations by network", filter: "network_name", render: (d, x, go) => <BarH rows={bars(d.by_network)} expanded={x} onRowClick={(row) => go("network_name", row.key)} /> },
  cities: { title: "Top registration cities", filter: "city", render: (d, x, go) => <BarH rows={bars(d.by_city)} expanded={x} onRowClick={(row) => go("city", row.key)} /> },
  organization_types: { title: "By registration level", filter: "organization_type", render: (d, x, go) => <BarH rows={bars(d.by_org_type, titleCase)} expanded={x} onRowClick={(row) => go("organization_type", row.key)} /> },
  readiness: { title: "Readiness status", filter: "readiness_status", render: (d, x, go) => <BarH rows={bars(d.by_readiness, (key) => READINESS_LABELS[key] || titleCase(key))} expanded={x} onRowClick={(row) => go("readiness_status", row.key)} /> },
};

const KPI_IDS = new Set(Object.entries(LIVE_WIDGETS).filter(([, widget]) => widget.kpi).map(([id]) => id));
const DEFAULT_LAYOUT = Object.keys(LIVE_WIDGETS).map((id) => ({ id, expanded: false }));

export function RegistrationsLive() {
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [layout, setLayout] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY));
      if (Array.isArray(saved)) return saved.filter((widget) => LIVE_WIDGETS[widget.id]);
    } catch { /* use default */ }
    return DEFAULT_LAYOUT;
  });
  const loadedFromServer = React.useRef(false);
  const dragId = React.useRef(null);

  React.useEffect(() => {
    let failed = false;
    const load = () => getJSON("/registrations/live").then(setData).catch(() => {
      if (!failed) { failed = true; toast.error("Could not load live registrations"); }
    });
    load();
    const timer = setInterval(load, POLL_MS);
    getJSON("/dashboard-layout?scope=registrations").then(({ layout: saved }) => {
      loadedFromServer.current = true;
      if (Array.isArray(saved) && saved.length) setLayout(saved.filter((widget) => LIVE_WIDGETS[widget.id]));
    }).catch(() => { loadedFromServer.current = true; });
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(layout));
    if (loadedFromServer.current) putJSON("/dashboard-layout?scope=registrations", { layout }).catch(() => toast.error("Could not save live dashboard layout"));
  }, [layout]);

  const hidden = Object.keys(LIVE_WIDGETS).filter((id) => !layout.some((widget) => widget.id === id));
  const patch = (id, values) => setLayout((current) => current.map((widget) => widget.id === id ? { ...widget, ...values } : widget));
  const go = (field, value) => navigate(`/registrations?${new URLSearchParams({ [field]: value }).toString()}`);
  const goFilters = (filters) => navigate(`/registrations?${new URLSearchParams(filters).toString()}`);

  function dropOn(targetId) {
    const sourceId = dragId.current;
    dragId.current = null;
    if (!sourceId || sourceId === targetId) return;
    setLayout((current) => {
      const next = current.filter((widget) => widget.id !== sourceId);
      next.splice(next.findIndex((widget) => widget.id === targetId), 0, current.find((widget) => widget.id === sourceId));
      return next;
    });
  }

  if (!data) return (
    <div className="mx-auto max-w-5xl space-y-4" role="status" aria-label="Loading">
      <Skeleton className="h-24" /><div className="grid gap-4 sm:grid-cols-2"><Card><CardContent className="pt-6"><LoadingRows rows={5} /></CardContent></Card><Card><CardContent className="pt-6"><LoadingRows rows={5} /></CardContent></Card></div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl"><div className="flex flex-wrap items-center gap-3"><h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">Live registrations</h2><span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 print:hidden"><Radio className="size-3.5 animate-pulse" /> Live</span></div><p className="mt-2 text-sm leading-6 text-slate-600">Crusade plans, geographic coverage and readiness as registrations arrive. Updates every 10 seconds.</p></div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {hidden.length > 0 && <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent [&::-webkit-details-marker]:hidden"><Plus /> Add widget</summary>
            <div className="absolute right-0 z-20 mt-1 max-h-80 w-64 overflow-y-auto border bg-popover p-1">
              {hidden.map((id) => <button key={id} type="button" className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={(event) => { setLayout((current) => [...current, { id, expanded: false }]); event.target.closest("details").open = false; }}>{LIVE_WIDGETS[id].title}</button>)}
            </div>
          </details>}
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()} title="Export this dashboard as a PDF"><FileDown /> Export PDF</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setLayout(DEFAULT_LAYOUT)}><RotateCcw /> Reset</Button>
        </div>
      </div>

      {layout.some((widget) => KPI_IDS.has(widget.id)) && <section aria-labelledby="registration-pulse-heading" className="overflow-hidden border-y border-blue-200 bg-white shadow-[0_18px_45px_-34px_rgba(37,99,235,0.35)] print:shadow-none">
        <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/70 px-5 py-3"><h3 id="registration-pulse-heading" className="text-xs font-semibold text-blue-900">Registration pulse</h3><p className="text-xs text-slate-500">Live planning totals</p></div>
        <div className="grid grid-cols-2 lg:grid-cols-4">
        {layout.filter((widget) => KPI_IDS.has(widget.id)).map(({ id }, index) => <div key={id} className={`group relative min-h-32 border-blue-100 ${KPI_TONES[id] || "bg-white [&_.stat-value]:!text-blue-700"} ${index % 2 ? "border-l" : ""} ${index >= 2 ? "border-t" : ""} ${index >= 4 ? "lg:border-t" : "lg:border-t-0"} ${index % 4 ? "lg:border-l" : "lg:border-l-0"}`} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(id)}>
          <button type="button" className="h-full w-full p-5 text-left" onClick={() => goFilters(LIVE_WIDGETS[id].filter)}>{LIVE_WIDGETS[id].render(data)}</button>
          <div className="absolute right-1.5 top-1.5 flex opacity-0 group-hover:opacity-100 print:hidden"><span draggable title="Drag to rearrange" className="cursor-grab p-1 text-muted-foreground" onDragStart={() => { dragId.current = id; }}><GripVertical /></span><button type="button" title="Remove widget" aria-label={`Remove ${LIVE_WIDGETS[id].title}`} className="p-1 text-muted-foreground hover:text-destructive" onClick={() => setLayout((current) => current.filter((widget) => widget.id !== id))}><X /></button></div>
        </div>)}
        </div>
      </section>}

      <section aria-labelledby="registration-breakdowns-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-4"><div><h3 id="registration-breakdowns-heading" className="text-lg font-semibold text-slate-950">Registration breakdowns</h3><p className="mt-1 text-sm text-slate-500">Select a row or location to open matching registrations.</p></div><span className="text-xs tabular-nums text-slate-500">{layout.filter((widget) => !KPI_IDS.has(widget.id)).length} visible</span></div>
      <div className="grid gap-5 sm:grid-cols-2">
        {layout.filter((widget) => !KPI_IDS.has(widget.id)).map(({ id, expanded }) => {
          const widget = LIVE_WIDGETS[id];
          return <Card key={id} className={`rounded-none border-x-0 border-slate-200 shadow-none ${expanded || widget.size === 2 ? "sm:col-span-2" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(id)}>
            <CardHeader className="flex-row items-center justify-between space-y-0 bg-slate-50/70 px-4 py-3">
              <div className="flex min-w-0 items-center gap-1.5"><span draggable title="Drag to rearrange" className="cursor-grab text-muted-foreground print:hidden" onDragStart={() => { dragId.current = id; }}><GripVertical /></span><div><CardTitle className="text-sm">{widget.title}</CardTitle>{id === "coverage" && <CardDescription>Click a location to open matching registrations.</CardDescription>}</div></div>
              <div className="flex text-muted-foreground print:hidden">
                {id === "countries" && <button type="button" title="Download Word report" aria-label="Download registrations by country report" className="p-1.5 hover:text-foreground" onClick={() => downloadCountryRegistrationsReport(data)}><FileText /></button>}
                {widget.size !== 2 && <button type="button" title={expanded ? "Collapse widget" : "Expand widget"} aria-label={`${expanded ? "Collapse" : "Expand"} ${widget.title}`} className="p-1.5 hover:text-foreground" onClick={() => patch(id, { expanded: !expanded })}>{expanded ? <Minimize2 /> : <Maximize2 />}</button>}
                <button type="button" title="Remove widget" aria-label={`Remove ${widget.title}`} className="p-1.5 hover:text-destructive" onClick={() => setLayout((current) => current.filter((item) => item.id !== id))}><X /></button>
              </div>
            </CardHeader>
            <CardContent className="px-4 py-5">{widget.render(data, expanded, go)}</CardContent>
          </Card>;
        })}
      </div>
      </section>
    </div>
  );
}
