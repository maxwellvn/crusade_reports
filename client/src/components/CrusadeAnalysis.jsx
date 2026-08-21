import * as React from "react";
import { BarChart3, ChevronDown, Download, FileDown, FileSpreadsheet, FileText, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingRows } from "@/components/ui/skeleton";
import { getJSON } from "@/lib/api";
import { nfull, typeLabel } from "@/lib/dashboardWidgets";
import { downloadNotcReportDocx } from "@/lib/printReportPdf";
import { cn } from "@/lib/utils";

const LEVELS = [
  ["zone", "By zone", "zone"],
  ["group", "By group", "group_name"],
  ["church", "By church", "church_name"],
];

const shortTypeLabel = (label) => label.replace(/ Crusades.*$/, "");

function analysisTypes(data) {
  const active = new Map(data.active_types || []);
  const mega = ["mega", active.get("mega") || "Mega Crusades"];
  const online = ["online", active.get("online") || "Online Crusades"];
  return [
    mega,
    ["cellular", "Cellular Crusades"],
    online,
    ...(data.active_types || []).filter(([key]) => !["mega", "online"].includes(key)),
  ];
}

function downloadAnalysisWord(data) {
  const types = analysisTypes(data);
  const overview = data.zone_type_breakdown.map((row) => ({
    zone: row.zone,
    mega: row.types.mega || 0,
    cellular: row.cellular || 0,
    online: row.types.online || 0,
    total: row.total,
  }));
  const details = data.zone_type_breakdown.flatMap((row) => types
    .map(([key, label]) => ({
      zone: row.zone,
      category: shortTypeLabel(label),
      crusades: key === "cellular" ? row.cellular || 0 : row.types[key] || 0,
    }))
    .filter((item) => item.crusades > 0));
  const cellularSection = (level, title) => ({
    title: `Cellular Crusades - ${title.toLowerCase()}`,
    columns: [
      { header: title, key: "key", width: 5000 },
      { header: "Registered crusades", key: "planned", align: "right", width: 2350 },
      { header: "Registration entries", key: "registrations", align: "right", width: 2350 },
    ],
    rows: data.cellular[`by_${level}`],
  });
  const date = new Date().toISOString().slice(0, 10);
  downloadNotcReportDocx({
    filename: `registered-crusade-analysis-${date}.docx`,
    eyebrow: "Night of a Thousand Crusades",
    title: "Registered Crusade Analysis",
    meta: "Registered crusade figures by zone, crusade type, and cellular ministry structure.",
    summary: [
      { label: "Total registered", value: nfull.format(data.summary.total) },
      { label: "Mega Crusades", value: nfull.format(data.summary.mega) },
      { label: "Cellular Crusades", value: nfull.format(data.summary.cellular) },
      { label: "Online Crusades", value: nfull.format(data.summary.online) },
    ],
    sections: [
      {
        title: "Primary crusade categories by zone",
        columns: [
          { header: "Zone", key: "zone", width: 3700 },
          { header: "Mega", key: "mega", align: "right", width: 1500 },
          { header: "Cellular", key: "cellular", align: "right", width: 1500 },
          { header: "Online", key: "online", align: "right", width: 1500 },
          { header: "Total", key: "total", align: "right", width: 1500 },
        ],
        rows: overview,
      },
      {
        title: "Complete crusade-type breakdown by zone",
        columns: [
          { header: "Zone", key: "zone", width: 4300 },
          { header: "Crusade category", key: "category", width: 3400 },
          { header: "Registered crusades", key: "crusades", align: "right", width: 2000 },
        ],
        rows: details,
      },
      cellularSection("zone", "Zone"),
      cellularSection("group", "Group"),
      cellularSection("church", "Church"),
      {
        title: "Cell breakdown by region, zone, and group",
        columns: [
          { header: "Region", key: "region", width: 1800 },
          { header: "Zone", key: "zone", width: 2600 },
          { header: "Group", key: "group_name", width: 2200 },
          { header: "Church", key: "church_name", width: 2200 },
          { header: "Cell", key: "key", width: 2400 },
          { header: "Crusades", key: "planned", align: "right", width: 1300 },
        ],
        rows: data.cellular.by_cell,
      },
    ],
    footer: "Prepared for NOTC campaign tracking and e-card production.",
  });
}

export function CrusadeAnalysis() {
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [tab, setTab] = React.useState("zones");
  const [level, setLevel] = React.useState("zone");
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    getJSON("/registrations/crusade-analysis").then(setData)
      .catch((error) => toast.error(error.message || "Could not load crusade analysis"));
  }, []);

  if (!data) return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs items={[{ label: "Live registrations", to: "/registrations/live" }, { label: "Crusade analysis" }]} />
      <div className="p-6"><LoadingRows rows={8} /></div>
    </div>
  );

  const types = analysisTypes(data);
  const needle = query.trim().toLowerCase();
  const zoneRows = data.zone_type_breakdown.filter((row) => !needle || row.zone.toLowerCase().includes(needle));
  const levelConfig = LEVELS.find(([key]) => key === level);
  const cellularRows = data.cellular[`by_${level}`].filter((row) => !needle || row.key.toLowerCase().includes(needle));
  const cellRows = data.cellular.by_cell.filter((row) => !needle || [row.region, row.zone, row.group_name, row.church_name, row.key].some((value) => String(value || "").toLowerCase().includes(needle)));
  const openRegistrations = (filters) => navigate(`/registrations?${new URLSearchParams(filters).toString()}`);
  const exportCurrent = (format) => {
    const params = new URLSearchParams({ view: tab, format });
    if (tab === "cellular") params.set("level", level);
    const link = Object.assign(document.createElement("a"), { href: `/api/registrations/crusade-analysis/export?${params}` });
    document.body.appendChild(link); link.click(); link.remove();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <Breadcrumbs items={[{ label: "Live registrations", to: "/registrations/live" }, { label: "Crusade analysis" }]} />
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-blue-700"><BarChart3 className="size-4" /><span className="text-xs font-semibold">Registration reports</span></div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Crusade analysis</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Registered crusades by zone, crusade category, and cellular ministry structure.</p>
        </div>
        <details className="relative print:hidden">
          <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <Download className="mr-2 size-4" /> Download report <ChevronDown className="ml-2 size-4" />
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
            <button type="button" onClick={(event) => { exportCurrent("csv"); event.currentTarget.closest("details").open = false; }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-blue-50"><FileText className="size-4" /> Current view as CSV</button>
            <button type="button" onClick={(event) => { exportCurrent("xlsx"); event.currentTarget.closest("details").open = false; }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-blue-50"><FileSpreadsheet className="size-4" /> Current view as Excel</button>
            <button type="button" onClick={(event) => { exportCurrent("pdf"); event.currentTarget.closest("details").open = false; }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-blue-50"><FileDown className="size-4" /> Current view as PDF</button>
            <hr className="my-1 border-slate-200" />
            <button type="button" onClick={(event) => { downloadAnalysisWord(data); event.currentTarget.closest("details").open = false; }} className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-blue-700 hover:bg-blue-50"><FileText className="size-4" /> Full analysis as Word</button>
          </div>
        </details>
      </header>

      <section aria-label="Registered crusade summary" className="overflow-hidden border-y border-slate-200 bg-white">
        <dl className="grid grid-cols-2 divide-x divide-y divide-slate-200 md:grid-cols-5 md:divide-y-0">
          <Summary value={data.summary.total} label="Total registered" />
          <Summary value={data.summary.mega} label="Mega" />
          <Summary value={data.summary.cellular} label="Cellular Crusades" />
          <Summary value={data.summary.online} label="Online" />
          <Summary value={data.summary.zones} label="Zones represented" className="col-span-2 md:col-span-1" />
        </dl>
      </section>

      <div className="flex w-full overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Crusade analysis view">
        {[["zones", "Zone breakdown"], ["cellular", "Cellular Crusades"], ["cells", "Cell breakdown"]].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setQuery(""); }}
            className={cn("shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium", tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900")}>{label}</button>
        ))}
      </div>

      {tab === "zones" ? (
        <section aria-labelledby="zone-breakdown-heading" className="space-y-4">
          <ReportToolbar title="Crusade types by zone" count={`${nfull.format(zoneRows.length)} zones`} query={query} setQuery={setQuery} placeholder="Search zones..." />
          <ZoneTable rows={zoneRows} types={types} onSelect={openRegistrations} />
        </section>
      ) : tab === "cellular" ? (
        <section aria-labelledby="cellular-breakdown-heading" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 id="cellular-breakdown-heading" className="text-base font-semibold text-slate-950">Cellular Crusades</h3>
              <p className="mt-1 text-sm text-slate-500">Cellular crusades grouped by zone, group, or church.</p>
            </div>
            <div className="flex rounded-lg bg-slate-200/70 p-1" role="tablist" aria-label="Cellular breakdown level">
              {LEVELS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={level === key} onClick={() => { setLevel(key); setQuery(""); }}
                className={cn("rounded-md px-3 py-1.5 text-sm font-medium", level === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950")}>{label}</button>)}
            </div>
          </div>
          <ReportToolbar count={`${nfull.format(cellularRows.length)} ${levelConfig[0]} entries`} query={query} setQuery={setQuery} placeholder={`Search ${levelConfig[0]}s...`} />
          <CellularTable rows={cellularRows} level={levelConfig} onSelect={openRegistrations} />
        </section>
      ) : (
        <section aria-labelledby="cell-breakdown-heading" className="space-y-4">
          <div>
            <h3 id="cell-breakdown-heading" className="text-base font-semibold text-slate-950">Cell breakdown by region</h3>
            <p className="mt-1 text-sm text-slate-500">See registered cells by Churches API region, with each region organised by zone and group.</p>
          </div>
          <ReportToolbar count={`${nfull.format(cellRows.length)} cells`} query={query} setQuery={setQuery} placeholder="Search region, zone, group, church or cell..." />
          <CellBreakdown rows={cellRows} onSelect={openRegistrations} />
        </section>
      )}
    </div>
  );
}

function Summary({ value, label, className }) {
  return <div className={cn("min-w-0 px-5 py-4", className)}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{nfull.format(value || 0)}</dd></div>;
}

function ReportToolbar({ title, count, query, setQuery, placeholder }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div>{title && <h3 className="text-base font-semibold text-slate-950">{title}</h3>}<p className={cn("text-xs text-slate-500", title && "mt-1")}>{count}</p></div><div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="pl-9" /></div></div>;
}

function Figure({ value, filters, label, onSelect }) {
  return value ? <button type="button" onClick={() => onSelect(filters)} aria-label={`${label}: ${nfull.format(value)}`} className="min-w-10 rounded px-2 py-1 text-right font-semibold tabular-nums text-blue-700 hover:bg-blue-50">{nfull.format(value)}</button> : <span className="px-2 text-slate-300">0</span>;
}

function ZoneTable({ rows, types, onSelect }) {
  if (!rows.length) return <div className="border-y border-slate-200 py-14 text-center text-sm text-slate-500">No zones match this search.</div>;
  return <div className="overflow-x-auto border-y border-slate-200 bg-white"><table className="min-w-full whitespace-nowrap text-sm"><thead><tr className="border-b bg-slate-50/80 text-left text-xs text-slate-500"><th className="sticky left-0 z-10 min-w-44 bg-slate-50 px-5 py-3 font-medium">Zone</th>{types.map(([key, label]) => <th key={key} className="px-4 py-3 text-right font-medium">{shortTypeLabel(label)}</th>)}<th className="px-4 py-3 text-right font-medium">Total</th></tr></thead><tbody>{rows.map((row) => <tr key={row.zone} className="border-b last:border-0 hover:bg-slate-50/50"><td className="sticky left-0 z-10 bg-white px-5 py-2.5 font-medium text-slate-900">{row.zone}</td>{types.map(([key]) => <td key={key} className="px-2 py-1.5 text-right">{key === "cellular" ? <Figure value={row.cellular} filters={{ zone: row.zone, cellular: "1" }} label={`${row.zone} Cellular Crusades`} onSelect={onSelect} /> : <Figure value={row.types[key] || 0} filters={{ zone: row.zone, event_type: key }} label={`${row.zone} ${typeLabel(key)}`} onSelect={onSelect} />}</td>)}<td className="px-2 py-1.5 text-right"><Figure value={row.total} filters={{ zone: row.zone }} label={`${row.zone} total`} onSelect={onSelect} /></td></tr>)}</tbody></table></div>;
}

function CellularTable({ rows, level, onSelect }) {
  if (!rows.length) return <div className="border-y border-slate-200 py-14 text-center text-sm text-slate-500">No entries match this search.</div>;
  return <div className="overflow-hidden border-y border-slate-200 bg-white"><table className="w-full text-sm"><thead><tr className="border-b bg-slate-50/80 text-left text-xs text-slate-500"><th className="px-5 py-3 font-medium">{level[1].replace("By ", "")}</th><th className="px-5 py-3 text-right font-medium">Registered crusades</th><th className="hidden px-5 py-3 text-right font-medium sm:table-cell">Registration entries</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key} className="border-b last:border-0 hover:bg-slate-50/50"><td className="px-5 py-3 font-medium text-slate-900">{row.key}</td><td className="px-3 py-2 text-right"><Figure value={row.planned} filters={{ cellular: "1", [level[2]]: row.key }} label={`${row.key} Cellular Crusades`} onSelect={onSelect} /></td><td className="hidden px-5 py-3 text-right tabular-nums text-slate-600 sm:table-cell">{nfull.format(row.registrations || 0)}</td></tr>)}</tbody></table></div>;
}

function CellBreakdown({ rows, onSelect }) {
  if (!rows.length) return <div className="border-y border-slate-200 py-14 text-center text-sm text-slate-500">No cells match this search.</div>;
  const regions = new Map();
  for (const row of rows) {
    if (!regions.has(row.region)) regions.set(row.region, new Map());
    const zones = regions.get(row.region);
    if (!zones.has(row.zone)) zones.set(row.zone, new Map());
    const group = row.group_name || "Group not specified";
    if (!zones.get(row.zone).has(group)) zones.get(row.zone).set(group, []);
    zones.get(row.zone).get(group).push(row);
  }
  const regionNumber = (name) => Number(String(name).match(/\d+/)?.[0]) || Number.MAX_SAFE_INTEGER;
  return <div className="space-y-10">{[...regions].sort(([a], [b]) => regionNumber(a) - regionNumber(b) || a.localeCompare(b)).map(([region, zones]) => {
    const regionRows = [...zones.values()].flatMap((groups) => [...groups.values()].flat());
    const regionCrusades = regionRows.reduce((sum, row) => sum + Number(row.planned || 0), 0);
    return <section key={region} aria-label={`${region} cell breakdown`} className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-blue-700 pb-3"><h4 className="text-xl font-semibold text-slate-950">{region}</h4><p className="text-sm text-slate-600">{nfull.format(zones.size)} zones · {nfull.format(regionRows.length)} registered cells · {nfull.format(regionCrusades)} crusades</p></header>
      <div className="space-y-6">{[...zones].sort(([a], [b]) => a.localeCompare(b)).map(([zone, groups]) => {
    const zoneRows = [...groups.values()].flat();
    const zoneCrusades = zoneRows.reduce((sum, row) => sum + Number(row.planned || 0), 0);
    return <section key={zone} className="overflow-hidden border border-slate-200 bg-white" aria-label={`${zone} cell breakdown`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 bg-slate-950 px-5 py-4 text-white"><h4 className="text-base font-semibold">{zone}</h4><p className="text-xs text-slate-300">{nfull.format(zoneRows.length)} registered cells · {nfull.format(zoneCrusades)} crusades</p></header>
      {[...groups].map(([group, groupRows]) => <div key={group} className="border-t border-slate-200 first:border-0">
        <div className="flex items-baseline justify-between gap-3 bg-blue-50 px-5 py-3"><h5 className="text-sm font-semibold text-blue-950">{group}</h5><span className="text-xs text-blue-700">{nfull.format(groupRows.length)} cell{groupRows.length === 1 ? "" : "s"}</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[38rem] text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="px-5 py-2.5 font-medium">Cell</th><th className="px-5 py-2.5 font-medium">Church</th><th className="px-5 py-2.5 text-right font-medium">Registered crusades</th><th className="px-5 py-2.5 text-right font-medium">Entries</th></tr></thead><tbody>{groupRows.map((row) => <tr key={`${row.church_name || ""}-${row.key}`} className="border-b last:border-0"><td className="px-5 py-3 font-medium text-slate-950">{row.key}</td><td className="px-5 py-3 text-slate-600">{row.church_name || "Not specified"}</td><td className="px-3 py-2 text-right"><Figure value={row.planned} filters={{ cellular: "1", zone: row.zone, group_name: row.group_name || "", cell_name: row.key }} label={`${row.key} Cellular Crusades`} onSelect={onSelect} /></td><td className="px-5 py-3 text-right tabular-nums text-slate-600">{nfull.format(row.registrations || 0)}</td></tr>)}</tbody></table></div>
      </div>)}
    </section>;
      })}</div>
    </section>;
  })}</div>;
}
