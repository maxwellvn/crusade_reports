import * as React from "react";
import { Download, FileSpreadsheet, Printer, Search, CheckCircle2, CircleDashed } from "lucide-react";
import { toast } from "sonner";
import { getJSON } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { LoadingRows } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat();

export function CrusadeCoverage() {
  const [data, setData] = React.useState(null);
  const [type, setType] = React.useState("zones");
  const [status, setStatus] = React.useState("");
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    getJSON("/coverage").then(setData).catch((error) => toast.error(error.message || "Could not load coverage"));
  }, []);

  const rows = React.useMemo(() => (data?.[type] || []).filter((row) => {
    const matchesStatus = !status || row.status === status;
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || [row.name, row.zone, row.region].some((value) => String(value || "").toLowerCase().includes(needle));
    return matchesStatus && matchesQuery;
  }), [data, type, status, query]);
  const summary = data?.summary?.[type];
  const percent = summary?.total ? Math.round((summary.registered / summary.total) * 100) : 0;

  function exportRows(format) {
    const params = new URLSearchParams({ type, format });
    if (status) params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    const link = Object.assign(document.createElement("a"), { href: `/api/coverage/export?${params}` });
    document.body.appendChild(link); link.click(); link.remove();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Crusade coverage" }]} />
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Crusade coverage</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">See every zone and group in the ministry directory, including those that have not yet registered a crusade.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => exportRows("csv")} disabled={!rows.length}><Download /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportRows("xlsx")} disabled={!rows.length}><FileSpreadsheet /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!rows.length}><Printer /> PDF</Button>
        </div>
      </header>

      <section aria-label={`${type} coverage summary`} className="grid gap-5 border-b border-slate-200 pb-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium text-slate-700">{type === "zones" ? "Zone" : "Group"} participation</p>
            <p className="text-sm tabular-nums text-slate-600">{percent}% covered</p>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
            <span className="bg-blue-600 transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <dl className="flex divide-x divide-slate-200 tabular-nums">
          <SummaryStat value={summary?.registered} label="Registered" />
          <SummaryStat value={summary?.not_registered} label="Not registered" />
          <SummaryStat value={summary?.total} label="Directory total" />
        </dl>
      </section>

      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center">
        <div className="flex rounded-lg bg-slate-200/70 p-1" aria-label="Coverage level">
          {[['zones', 'Zones'], ['groups', 'Groups']].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)}
              className={cn("rounded-md px-4 py-1.5 text-sm font-medium transition-colors", type === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950")}>{label}</button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder={`Search ${type}, zones or regions…`} aria-label={`Search ${type}`} />
        </div>
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="sm:w-48" aria-label="Filter registration status">
          <option value="">All statuses</option><option value="registered">Registered</option><option value="not_registered">Not registered</option>
        </Select>
      </div>

      <section className="overflow-hidden border-y border-slate-200 bg-white">
        {!data ? <div className="p-6"><LoadingRows rows={8} /></div> : !rows.length ? (
          <div className="px-6 py-16 text-center"><p className="font-medium text-slate-800">No directory entries match</p><p className="mt-1 text-sm text-slate-500">Change the search or status filter to see more results.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">{type === "zones" ? "Zone" : "Group"}</th>
                {type === "groups" && <th className="px-5 py-3 font-medium">Zone</th>}
                <th className="px-5 py-3 font-medium">Region</th><th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Crusades</th>
              </tr></thead>
              <tbody>{rows.map((row) => <tr key={type === "groups" ? `${row.zone}-${row.id}-${row.name}` : row.name} className="border-b last:border-0">
                <td className="px-5 py-3 font-medium text-slate-900">{row.name}</td>
                {type === "groups" && <td className="px-5 py-3 text-slate-600">{row.zone}</td>}
                <td className="px-5 py-3 text-slate-600">{row.region}</td><td className="px-5 py-3"><Status status={row.status} /></td>
                <td className="px-5 py-3 text-right font-medium tabular-nums">{number.format(row.crusades)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
      {data && <p className="text-xs text-slate-500 print:hidden">Showing {number.format(rows.length)} of {number.format(summary?.total || 0)} {type}.</p>}
    </div>
  );
}

function SummaryStat({ value = 0, label }) {
  return <div className="px-4 first:pl-0 md:first:pl-4"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 text-xl font-semibold text-slate-950">{number.format(value)}</dd></div>;
}

function Status({ status }) {
  const registered = status === "registered";
  const Icon = registered ? CheckCircle2 : CircleDashed;
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium", registered ? "text-emerald-700" : "text-slate-500")}><Icon className="size-3.5" />{registered ? "Registered" : "Not registered"}</span>;
}
