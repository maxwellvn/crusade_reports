import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { X, Search } from "lucide-react";
import { useTableSort, Pagination } from "@/lib/tableTools";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { LoadingRows } from "@/components/ui/skeleton";
import { getJSON } from "@/lib/api";
import { CRUSADE_TYPES } from "@/lib/constants";
import { typeLabel, nfull } from "@/lib/dashboardWidgets";

// All registrations — same interaction model as the All Crusades table:
// URL-driven filters + free-text search + server-side sorting + pagination.

const ORG_TYPES = [["zone", "Zone"], ["group", "Group"], ["church", "Church"], ["network", "Network"]];
const FILTERS = [
  ["organization_type", "Registered as", "select", ORG_TYPES],
  ["zone", "Zone", "text"],
  ["country", "Country", "text"],
  ["event_type", "Crusade type", "select", CRUSADE_TYPES],
  ["date_from", "Plan date from", "date"],
  ["date_to", "Plan date to", "date"],
];
const PAGE_SIZE = 50;

export function RegistrationsTable() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = React.useState(null);
  const page = Math.max(parseInt(params.get("page"), 10) || 1, 1);

  const [q, setQ] = React.useState(params.get("q") || "");
  React.useEffect(() => setQ(params.get("q") || ""), [params]);
  React.useEffect(() => {
    const t = setTimeout(() => { if (q !== (params.get("q") || "")) setFilter("q", q.trim()); }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const qs = new URLSearchParams(params);
    qs.set("page_size", PAGE_SIZE);
    getJSON(`/registrations?${qs.toString()}`).then(setData).catch(() => toast.error("Could not load registrations"));
  }, [params]);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setParams(next);
  }
  function setPage(p) {
    const next = new URLSearchParams(params);
    next.set("page", p);
    setParams(next);
  }
  const { Th } = useTableSort(params, setParams, "created_at");

  const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;
  const activeFilters = FILTERS.filter(([key]) => params.get(key));
  const itemsByReg = {};
  (data?.items || []).forEach((it) => {
    (itemsByReg[it.registration_id] ||= []).push(
      `${nfull.format(it.planned_count)} ${typeLabel(it.event_type)}${it.city ? ` (${it.city})` : ""}`
    );
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Breadcrumbs items={[{ label: "Dashboard", to: "/dashboard" }, { label: "All registrations" }]} />
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">All registrations</h2>
        {data && <p className="text-sm text-muted-foreground">{nfull.format(data.total)} matching</p>}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-6"
              placeholder="Search anything — zone, church, network, country, city, type…" aria-label="Search registrations" />
          </div>
        </CardContent>
        <CardContent className="grid gap-3 pt-0 sm:grid-cols-3 lg:grid-cols-6">
          {FILTERS.map(([key, label, kind, options]) => (
            <Field key={key} label={label}>
              {kind === "select" ? (
                <Select value={params.get(key) || ""} onChange={(e) => setFilter(key, e.target.value)}>
                  <option value="">Any</option>
                  {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              ) : (
                <Input type={kind} value={params.get(key) || ""} onChange={(e) => setFilter(key, e.target.value)}
                  placeholder={kind === "text" ? `Any ${label.toLowerCase()}` : undefined} />
              )}
            </Field>
          ))}
        </CardContent>
        {activeFilters.length > 0 && (
          <CardContent className="flex flex-wrap gap-2 pt-0">
            {activeFilters.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setFilter(key, "")}
                className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent">
                {label}: {params.get(key)} <X className="size-3" />
              </button>
            ))}
            <button type="button" onClick={() => setParams({})} className="text-xs font-medium text-muted-foreground hover:text-foreground">
              Clear all
            </button>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {!data ? (
            <LoadingRows rows={8} />
          ) : !data.rows.length ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No registrations match these filters.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <Th col="created_at" label="Registered" />
                  <Th col="org" label="By" />
                  <Th col="zone" label="Zone" />
                  <Th col="country" label="Country" />
                  <Th col="plan_date" label="Plan date" />
                  <th className="py-2 pr-3 font-medium">Breakdown</th>
                  <Th col="planned" label="Planned" right />
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{r.created_at.slice(0, 10)}</td>
                    <td className="max-w-44 truncate py-2 pr-3 capitalize">{r.org}</td>
                    <td className="max-w-40 truncate py-2 pr-3">{r.zone}</td>
                    <td className="max-w-36 truncate py-2 pr-3">{r.country}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{r.plan_date}</td>
                    <td className="max-w-72 truncate py-2 pr-3 text-muted-foreground" title={(itemsByReg[r.id] || []).join(" · ")}>
                      {(itemsByReg[r.id] || []).join(" · ")}
                    </td>
                    <td className="py-2 text-right font-medium">{nfull.format(r.planned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {data && data.total > PAGE_SIZE && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
    </div>
  );
}
