import * as React from "react";
import { Check, CheckCircle2, CircleDashed, Download, FileDown, FileSpreadsheet, Search, X } from "lucide-react";
import { toast } from "sonner";
import { getJSON } from "@/lib/api";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingRows } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat();

export function PastoralChecklist() {
  const [data, setData] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [status, setStatus] = React.useState("");

  React.useEffect(() => {
    getJSON("/pastoral-checklist").then(setData).catch((error) => toast.error(error.message || "Could not load the pastoral checklist"));
  }, []);

  const rows = React.useMemo(() => (data?.rows || []).filter((row) => {
    const needle = query.trim().toLowerCase();
    if (needle && ![row.zone, row.region, row.pastor_name, ...row.selected_nations]
      .some((value) => String(value || "").toLowerCase().includes(needle))) return false;
    if (region && row.region !== region) return false;
    if (status === "complete" && !row.complete) return false;
    if (status === "incomplete" && row.complete) return false;
    if (status === "no_registration" && row.has_registration) return false;
    if (status === "no_cellular" && row.has_cellular) return false;
    if (status === "no_nation" && row.has_nation_selection) return false;
    if (status === "no_prayer_march" && row.has_prayer_march) return false;
    if (status === "no_wonders_diamond" && row.has_wonders_diamond) return false;
    return true;
  }), [data, query, region, status]);

  const hasFilters = Boolean(query || region || status);
  const completion = data?.summary?.total ? Math.round((data.summary.complete / data.summary.total) * 100) : 0;

  function exportRows(format) {
    const params = new URLSearchParams({ format });
    if (query.trim()) params.set("q", query.trim());
    if (region) params.set("region", region);
    if (status) params.set("status", status);
    window.location.assign(`/api/pastoral-checklist/export?${params}`);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Pastoral checklist" }]} />
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Pastoral checklist for NOTC accountability</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Checklist status for every official zone based on the activity records available in the portal.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportRows("csv")} disabled={!rows.length}><Download /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportRows("xlsx")} disabled={!rows.length}><FileSpreadsheet /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => exportRows("pdf")} disabled={!rows.length}><FileDown /> PDF</Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <Summary label="Official zones" value={data?.summary?.total} />
        <Summary label="Checklist complete" value={data?.summary?.complete} accent />
        <Summary label="Cellular registered" value={data?.summary?.cellular} />
        <Summary label="Nation adoption" value={data?.summary?.nation_selected} />
        <Summary label="Prayer March" value={data?.summary?.prayer_march} />
        <Summary label="Wonders to Diamond" value={data?.summary?.wonders_diamond} />
        <Summary label="NOTC registered" value={data?.summary?.registered} />
      </section>

      <section className="border-y border-slate-200 py-5">
        <div className="flex items-baseline justify-between gap-4">
          <div><p className="text-sm font-medium text-slate-800">Full checklist completion</p><p className="mt-1 text-xs text-slate-500">A zone is complete when all five records are present.</p></div>
          <p className="text-sm font-semibold tabular-nums text-slate-900">{completion}%</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-600 transition-[width]" style={{ width: `${completion}%` }} /></div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_18rem_auto]">
        <label className="relative block"><span className="sr-only">Search zones or pastors</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search zone, region, pastor or nation" className="pl-9" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-slate-500 hover:text-slate-950"><X className="size-4" /></button>}</label>
        <Select value={region} onChange={(event) => setRegion(event.target.value)} aria-label="Filter by region"><option value="">All regions</option>{(data?.filter_options?.regions || []).map((value) => <option key={value} value={value}>{value}</option>)}</Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter checklist status"><option value="">All statuses</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option><option value="no_cellular">No cellular crusade</option><option value="no_nation">No nation adoption</option><option value="no_prayer_march">No Prayer March record</option><option value="no_wonders_diamond">No Wonders to Diamond record</option><option value="no_registration">No NOTC registration</option></Select>
        {hasFilters && <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setRegion(""); setStatus(""); }}><X /> Clear</Button>}
      </div>

      <section className="border-y border-slate-200 bg-white">
        {!data ? <div className="p-6"><LoadingRows rows={8} /></div> : !rows.length ? <div className="px-6 py-16 text-center"><p className="font-semibold text-slate-950">No zones match</p><p className="mt-2 text-sm text-slate-600">Change or clear the active filters.</p></div> : <>
          <div className="divide-y divide-slate-200 md:hidden">{rows.map((row) => <ZoneChecklist key={row.zone} row={row} />)}</div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1180px] text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500"><th className="px-4 py-3 font-medium">Zone / Pastor</th><th className="px-4 py-3 font-medium">Cellular crusades registered</th><th className="px-4 py-3 font-medium">Nation adoption</th><th className="px-4 py-3 font-medium">NOTC Prayer March participation</th><th className="px-4 py-3 font-medium">Wonders to Diamond conference hosted</th><th className="px-4 py-3 font-medium">NOTC registration complete</th><th className="px-4 py-3 font-medium">Progress</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.zone} className="border-b border-slate-200 align-top last:border-0 hover:bg-slate-50/60"><td className="px-4 py-4"><p className="font-semibold text-slate-950">{row.zone}</p><p className="mt-1 text-xs text-slate-500">{row.region}</p><p className="mt-1 text-xs font-medium text-slate-700">{row.pastor_name || "Pastor not identified"}</p></td><td className="px-4 py-4"><Evidence complete={row.has_cellular} detail={row.has_cellular ? `${number.format(row.cellular_crusades)} cellular crusades` : "No record"} /></td><td className="max-w-52 px-4 py-4"><Evidence complete={row.has_nation_selection} detail={row.has_nation_selection ? row.selected_nations.join(", ") : "No record"} /></td><td className="px-4 py-4"><Evidence complete={row.has_prayer_march} detail={row.has_prayer_march ? "Participation recorded" : "No record"} /></td><td className="px-4 py-4"><Evidence complete={row.has_wonders_diamond} detail={row.has_wonders_diamond ? "Conference recorded" : "No record"} /></td><td className="px-4 py-4"><Evidence complete={row.has_registration} detail={row.has_registration ? `${number.format(row.registered_crusades)} crusades registered` : "No record"} /></td><td className="px-4 py-4"><Progress row={row} /></td></tr>)}</tbody>
            </table>
          </div>
        </>}
      </section>
      {data && <p className="text-xs text-slate-500">Showing {number.format(rows.length)} of {number.format(data.summary.total)} official zones.</p>}
    </div>
  );
}

function Summary({ label, value = 0, accent = false }) {
  return <div className={cn("border-l-2 border-blue-200 py-2 pl-4", accent && "border-emerald-500")}><p className="text-xs font-medium text-slate-500">{label}</p><p className={cn("mt-1 text-2xl font-semibold tabular-nums text-slate-950", accent && "text-emerald-700")}>{number.format(value || 0)}</p></div>;
}

function Evidence({ complete, detail }) {
  const Icon = complete ? CheckCircle2 : CircleDashed;
  return <div><span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", complete ? "text-emerald-700" : "text-slate-500")}><Icon className="size-4" />{complete ? "Recorded" : "Outstanding"}</span><p className="mt-1.5 text-xs leading-5 text-slate-600">{detail}</p></div>;
}

function Progress({ row }) {
  return <div className="min-w-24"><div className="flex items-center gap-2"><span className={cn("grid size-6 place-items-center rounded-full", row.complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>{row.complete ? <Check className="size-4" /> : row.completed_items}</span><span className="text-xs font-semibold text-slate-700">{row.completed_items}/5</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={cn("h-full", row.complete ? "bg-emerald-600" : "bg-blue-600")} style={{ width: `${row.completed_items * 20}%` }} /></div></div>;
}

function ZoneChecklist({ row }) {
  return <article className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">{row.zone}</h3><p className="mt-1 text-xs text-slate-500">{row.region} | {row.pastor_name || "Pastor not identified"}</p></div><Progress row={row} /></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Evidence complete={row.has_cellular} detail={row.has_cellular ? `${number.format(row.cellular_crusades)} cellular crusades registered` : "No cellular crusade record"} /><Evidence complete={row.has_nation_selection} detail={row.has_nation_selection ? row.selected_nations.join(", ") : "No nation adoption record"} /><Evidence complete={row.has_prayer_march} detail={row.has_prayer_march ? "Prayer March participation recorded" : "No Prayer March record"} /><Evidence complete={row.has_wonders_diamond} detail={row.has_wonders_diamond ? "Wonders to Diamond conference recorded" : "No Wonders to Diamond record"} /><Evidence complete={row.has_registration} detail={row.has_registration ? `${number.format(row.registered_crusades)} crusades registered` : "No NOTC registration"} /></div></article>;
}
