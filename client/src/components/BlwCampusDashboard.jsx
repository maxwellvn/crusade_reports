import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, CheckCircle2, ChevronDown, Download, FileSpreadsheet, FileText, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingRows } from "@/components/ui/skeleton";
import { downloadFile, getJSON } from "@/lib/api";
import { nfull, typeLabel } from "@/lib/dashboardWidgets";
import { Pagination } from "@/lib/tableTools";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;
const VIEWS = [
  ["overview", "Campus regions"],
  ["registrations", "Registered crusades"],
  ["reports", "Submitted reports"],
];
const FILTER_KEYS = ["region", "zone", "event_type", "date_from", "date_to"];

const displayDate = (value) => {
  if (!value) return "Not specified";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
};

function queryFrom(params, { includeSearch = true, includePage = false } = {}) {
  const query = new URLSearchParams();
  for (const key of FILTER_KEYS) if (params.get(key)) query.set(key, params.get(key));
  if (includeSearch && params.get("q")) query.set("q", params.get("q"));
  if (includePage) {
    query.set("page", params.get("page") || "1");
    query.set("page_size", String(PAGE_SIZE));
  }
  return query;
}

function ExportMenu({ view, params }) {
  const [working, setWorking] = React.useState(false);

  async function download(format) {
    setWorking(true);
    try {
      const query = queryFrom(params, { includeSearch: view !== "overview" });
      query.set("format", format);
      await downloadFile(`/blw-campus/${view}/export?${query}`, `blw-campus-${view}.${format}`);
    } catch (error) {
      toast.error(error.message || "Could not download the BLW Campus report.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <details className="relative print:hidden">
      <summary className={cn("flex h-10 cursor-pointer list-none items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 [&::-webkit-details-marker]:hidden", working && "pointer-events-none opacity-60")}>
        <Download className="mr-2 size-4" /> Download <ChevronDown className="ml-2 size-4" />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
        <ExportOption icon={FileText} label="CSV" onClick={() => download("csv")} />
        <ExportOption icon={FileSpreadsheet} label="Excel" onClick={() => download("xlsx")} />
        <ExportOption icon={FileText} label="PDF" onClick={() => download("pdf")} />
      </div>
    </details>
  );
}

function ExportOption({ icon: Icon, label, onClick }) {
  return <button type="button" onClick={(event) => { onClick(); event.currentTarget.closest("details").open = false; }} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-50 hover:text-blue-700"><Icon className="size-4" />{label}</button>;
}

export function BlwCampusDashboard() {
  const [params, setParams] = useSearchParams();
  const [overview, setOverview] = React.useState(null);
  const [records, setRecords] = React.useState(null);
  const [query, setQuery] = React.useState(params.get("q") || "");
  const view = VIEWS.some(([key]) => key === params.get("view")) ? params.get("view") : "overview";
  const page = Math.max(parseInt(params.get("page"), 10) || 1, 1);

  React.useEffect(() => setQuery(params.get("q") || ""), [params]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query === (params.get("q") || "")) return;
      const next = new URLSearchParams(params);
      if (query.trim()) next.set("q", query.trim()); else next.delete("q");
      next.delete("page");
      setParams(next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, params, setParams]);

  const overviewQuery = queryFrom(params, { includeSearch: false }).toString();
  React.useEffect(() => {
    setOverview(null);
    getJSON(`/blw-campus/overview?${overviewQuery}`).then(setOverview)
      .catch((error) => toast.error(error.message || "Could not load BLW Campus figures."));
  }, [overviewQuery]);

  const recordsQuery = queryFrom(params, { includeSearch: true, includePage: true }).toString();
  React.useEffect(() => {
    if (view === "overview") { setRecords(null); return; }
    setRecords(null);
    getJSON(`/blw-campus/${view}?${recordsQuery}`).then(setRecords)
      .catch((error) => toast.error(error.message || "Could not load BLW Campus records."));
  }, [view, recordsQuery]);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key === "region" && value && overview?.filters?.zone_options?.every((entry) => entry.region !== value || entry.zone !== next.get("zone"))) next.delete("zone");
    next.delete("page");
    setParams(next);
  }
  function setView(nextView) {
    const next = new URLSearchParams(params);
    next.set("view", nextView);
    next.delete("page");
    setParams(next);
  }
  function setPage(nextPage) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  }
  function openZone(zone) {
    const next = new URLSearchParams(params);
    next.set("zone", zone);
    next.set("view", "registrations");
    next.delete("page");
    setParams(next);
  }

  const zoneOptions = (overview?.filters?.zone_options || []).filter((entry) => !params.get("region") || entry.region === params.get("region"));
  const activeFilters = FILTER_KEYS.filter((key) => params.get(key));
  const totalPages = records ? Math.max(Math.ceil(records.total / PAGE_SIZE), 1) : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "BLW Campus" }]} />
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-blue-700"><Building2 className="size-4" /><span className="text-xs font-semibold">BLW reports</span></div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">BLW campus regions</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Registered crusades and submitted reports from BLW zones, organised by campus region.</p>
        </div>
        <ExportMenu view={view} params={params} />
      </header>

      {!overview ? <div className="border-y border-slate-200 bg-white p-5"><LoadingRows rows={4} /></div> : (
        <section aria-label="BLW Campus summary" className="overflow-hidden border-y border-slate-200 bg-white">
          <dl className="grid grid-cols-2 divide-x divide-y divide-slate-200 sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
            <Summary label="Campus regions" value={overview.summary.campus_regions} />
            <Summary label="BLW zones" value={overview.summary.campus_zones} />
            <Summary label="Zones registered" value={overview.summary.zones_with_registrations} />
            <Summary label="Crusades registered" value={overview.summary.registered_crusades} />
            <Summary label="Reports submitted" value={overview.summary.reports_submitted} />
            <Summary label="Souls won" value={overview.summary.souls_won} />
          </dl>
        </section>
      )}

      <section aria-label="Search and filter BLW Campus records" className="border-y border-slate-200 bg-white print:hidden">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-7">
          <Field label="Search" className="sm:col-span-2 lg:col-span-2">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder={view === "overview" ? "Search region or BLW zone" : "Search crusade, location or church"} /></div>
          </Field>
          <Field label="Campus region"><Select value={params.get("region") || ""} onChange={(event) => setFilter("region", event.target.value)}><option value="">All regions</option>{(overview?.filters?.regions || []).map((region) => <option key={region} value={region}>{region}</option>)}</Select></Field>
          <Field label="BLW zone"><Select value={params.get("zone") || ""} onChange={(event) => setFilter("zone", event.target.value)}><option value="">All BLW zones</option>{zoneOptions.map((entry) => <option key={entry.zone} value={entry.zone}>{entry.zone}</option>)}</Select></Field>
          <Field label="Crusade type"><Select value={params.get("event_type") || ""} onChange={(event) => setFilter("event_type", event.target.value)}><option value="">All types</option>{(overview?.filters?.event_types || []).map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</Select></Field>
          <Field label="Crusade date" className="lg:col-span-2"><div className="grid grid-cols-2 gap-2"><Input type="date" aria-label="Crusade date from" value={params.get("date_from") || ""} onChange={(event) => setFilter("date_from", event.target.value)} /><Input type="date" aria-label="Crusade date to" value={params.get("date_to") || ""} onChange={(event) => setFilter("date_to", event.target.value)} /></div></Field>
        </div>
        {(activeFilters.length > 0 || params.get("q")) && <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3"><span className="text-xs font-medium text-slate-500">Applied</span>{activeFilters.map((key) => <button key={key} type="button" onClick={() => setFilter(key, "")} className="flex cursor-pointer items-center gap-1 rounded-full border bg-slate-100 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-blue-50">{params.get(key)} <X className="size-3" /></button>)}<button type="button" onClick={() => setParams({ view })} className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-900">Clear all</button></div>}
      </section>

      <div className="flex w-full overflow-x-auto border-b border-slate-200" role="tablist" aria-label="BLW Campus report view">
        {VIEWS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={cn("shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors", view === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900")}>{label}</button>)}
      </div>

      {view === "overview" ? <CampusOverview data={overview} query={query} onOpenZone={openZone} /> : view === "registrations" ? <RegistrationRows data={records} /> : <ReportRows data={records} />}
      {records && records.total > PAGE_SIZE && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
    </div>
  );
}

function Summary({ label, value }) {
  return <div className="min-w-0 px-4 py-4 sm:px-5"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{nfull.format(value || 0)}</dd></div>;
}

function CampusOverview({ data, query, onOpenZone }) {
  if (!data) return <div className="border-y border-slate-200 bg-white p-5"><LoadingRows rows={8} /></div>;
  const needle = query.trim().toLowerCase();
  const zones = data.zones.filter((row) => !needle || row.region.toLowerCase().includes(needle) || row.zone.toLowerCase().includes(needle));
  const grouped = new Map();
  for (const row of zones) {
    if (!grouped.has(row.region)) grouped.set(row.region, []);
    grouped.get(row.region).push(row);
  }
  if (!zones.length) return <Empty text="No BLW campus regions match this search." />;
  return <div className="space-y-8">{[...grouped].map(([region, rows]) => <section key={region} aria-label={`${region} BLW Campus activity`}>
    <header className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-blue-700 pb-3"><h3 className="text-lg font-semibold text-slate-950">{region}</h3><p className="text-xs text-slate-500">{nfull.format(rows.length)} BLW zones</p></header>
    <div className="overflow-x-auto bg-white"><table className="min-w-[56rem] w-full text-sm"><thead><tr className="border-b bg-slate-50/80 text-left text-xs text-slate-500"><th className="px-5 py-3 font-medium">BLW zone</th><th className="px-4 py-3 text-right font-medium">Registered</th><th className="px-4 py-3 text-right font-medium">Entries</th><th className="px-4 py-3 text-right font-medium">Reports</th><th className="px-4 py-3 text-right font-medium">Attendance</th><th className="px-4 py-3 text-right font-medium">Souls won</th><th className="px-4 py-3 text-right font-medium">Rhapsody</th></tr></thead><tbody>{rows.map((row) => <tr key={row.zone} className="border-b last:border-0 hover:bg-slate-50/60"><td className="px-5 py-3"><button type="button" onClick={() => onOpenZone(row.zone)} className="cursor-pointer font-medium text-blue-700 hover:text-blue-900 hover:underline">{row.zone}</button></td><Figure value={row.registered_crusades} /><Figure value={row.registration_entries} /><Figure value={row.reports_submitted} /><Figure value={row.attendance} /><Figure value={row.souls_won} /><Figure value={row.rhapsody_distributed} /></tr>)}</tbody></table></div>
  </section>)}</div>;
}

function Figure({ value }) {
  return <td className="px-4 py-3 text-right tabular-nums text-slate-700">{nfull.format(value || 0)}</td>;
}

function RegistrationRows({ data }) {
  if (!data) return <div className="border-y border-slate-200 bg-white p-5"><LoadingRows rows={9} /></div>;
  if (!data.rows.length) return <Empty text="No BLW Campus registrations match these filters." />;
  return <section aria-label="BLW Campus registered crusades" className="overflow-x-auto border-y border-slate-200 bg-white"><div className="flex items-center justify-between border-b px-4 py-3"><h3 className="text-sm font-semibold text-slate-950">Registered crusades</h3><p className="text-xs tabular-nums text-slate-500">{nfull.format(data.total)} matching</p></div><table className="min-w-[68rem] w-full text-sm"><thead><tr className="border-b bg-slate-50/80 text-left text-xs text-slate-500"><th className="px-4 py-3 font-medium">Crusade</th><th className="px-4 py-3 font-medium">Campus region / zone</th><th className="px-4 py-3 font-medium">Church structure</th><th className="px-4 py-3 font-medium">Date and location</th><th className="px-4 py-3 text-right font-medium">Expected</th><th className="px-4 py-3 font-medium">Readiness</th><th className="px-4 py-3 font-medium">Report</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className="border-b align-top last:border-0 hover:bg-slate-50/60"><td className="px-4 py-3"><p className="font-medium text-slate-950">{row.event_name || typeLabel(row.event_type, row.other_event_type)}</p><p className="mt-1 text-xs text-slate-500">{typeLabel(row.event_type, row.other_event_type)}</p></td><td className="px-4 py-3"><p>{row.region}</p><p className="mt-1 text-xs text-slate-500">{row.zone}</p></td><td className="px-4 py-3 text-slate-700">{[row.group_name, row.church_name, row.cell_name].filter(Boolean).join(" / ") || "Not specified"}</td><td className="px-4 py-3"><p>{displayDate(row.event_date)}</p><p className="mt-1 text-xs text-slate-500">{[row.city, row.country].filter(Boolean).join(", ") || "Not specified"}</p></td><td className="px-4 py-3 text-right tabular-nums">{nfull.format(row.expected_attendance || 0)}</td><td className="px-4 py-3"><Badge variant="outline">{String(row.readiness_status || "pending").replaceAll("_", " ")}</Badge></td><td className="px-4 py-3">{row.report_submitted ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-4" />Submitted</span> : <span className="text-xs text-slate-500">Awaiting</span>}</td></tr>)}</tbody></table></section>;
}

function ReportRows({ data }) {
  if (!data) return <div className="border-y border-slate-200 bg-white p-5"><LoadingRows rows={9} /></div>;
  if (!data.rows.length) return <Empty text="No BLW Campus reports match these filters." />;
  return <section aria-label="BLW Campus submitted reports" className="overflow-x-auto border-y border-slate-200 bg-white"><div className="flex items-center justify-between border-b px-4 py-3"><h3 className="text-sm font-semibold text-slate-950">Submitted reports</h3><p className="text-xs tabular-nums text-slate-500">{nfull.format(data.total)} matching</p></div><table className="min-w-[70rem] w-full text-sm"><thead><tr className="border-b bg-slate-50/80 text-left text-xs text-slate-500"><th className="px-4 py-3 font-medium">Report / crusade</th><th className="px-4 py-3 font-medium">Campus region / zone</th><th className="px-4 py-3 font-medium">Date and location</th><th className="px-4 py-3 text-right font-medium">Attendance</th><th className="px-4 py-3 text-right font-medium">Souls won</th><th className="px-4 py-3 text-right font-medium">Rhapsody</th><th className="px-4 py-3 text-right font-medium">Online</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className="border-b align-top last:border-0 hover:bg-slate-50/60"><td className="px-4 py-3"><p className="font-medium text-slate-950">{row.event_name || typeLabel(row.event_type, row.other_event_type)}</p><p className="mt-1 text-xs text-slate-500">Report {row.report_id} · {typeLabel(row.event_type, row.other_event_type)}</p></td><td className="px-4 py-3"><p>{row.region}</p><p className="mt-1 text-xs text-slate-500">{row.zone}</p></td><td className="px-4 py-3"><p>{displayDate(row.event_date)}</p><p className="mt-1 text-xs text-slate-500">{[row.city, row.country].filter(Boolean).join(", ") || "Not specified"}</p></td><Figure value={row.attendance} /><Figure value={row.salvation} /><Figure value={row.ror_distributed} /><Figure value={row.online_participation} /></tr>)}</tbody></table></section>;
}

function Empty({ text }) {
  return <div className="border-y border-slate-200 bg-white py-16 text-center text-sm text-slate-500">{text}</div>;
}
