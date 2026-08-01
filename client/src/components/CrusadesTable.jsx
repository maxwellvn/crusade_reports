import * as React from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Trash2, X, Search, Download, FileSpreadsheet, Pencil, SlidersHorizontal, ChevronDown } from "lucide-react";
import { useTableSort, Pagination } from "@/lib/tableTools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { LoadingRows } from "@/components/ui/skeleton";
import { deleteJSON, getJSON } from "@/lib/api";
import { useAdmin } from "@/components/AdminGate";
import { CRUSADE_TYPES, FORMATS, CORE_OUTCOMES, EXTENDED_OUTCOMES } from "@/lib/constants";
import { typeLabel, nfull, orgHierarchy, WIDGETS, DRILL_MAP } from "@/lib/dashboardWidgets";

// Every metric that can be uploaded, in the same order as the form/import —
// this table shows the full received row, not a trimmed summary.
const METRIC_COLS = [["online_participation", "Online"], ...CORE_OUTCOMES, ...EXTENDED_OUTCOMES];
const n0 = (v) => nfull.format(v || 0);

const ORG_TYPES = [["zone", "Zone"], ["group", "Group"], ["church", "Church"], ["cell", "Cell"], ["network", "Network"]];
// One entry per filter: query-string key, label, and the field kind used to pick a control.
const FILTERS = [
  ["organization_type", "Reporting as", "select", ORG_TYPES],
  ["zone", "Zone", "text"],
  ["group_name", "Group", "text"],
  ["church_name", "Church", "text"],
  ["cell_name", "Cell", "text"],
  ["network_name", "Network", "text"],
  ["country", "Country", "text"],
  ["city", "City", "text"],
  ["event_type", "Crusade type", "select", CRUSADE_TYPES],
  ["format", "Format", "select", FORMATS],
  ["min_attendance", "Min attendance", "number"],
  ["date_from", "From date", "date"],
  ["date_to", "To date", "date"],
];

const PAGE_SIZE = 50;

// All crusades, one row each, filterable by every attribution + format field.
// Reached directly (nav link) or by clicking a breakdown row on the dashboard.
export function CrusadesTable() {
  const admin = useAdmin();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = React.useState(null);
  const [deleting, setDeleting] = React.useState(null);
  const [showFilters, setShowFilters] = React.useState(() => FILTERS.some(([key]) => params.has(key)));
  const page = Math.max(parseInt(params.get("page"), 10) || 1, 1);

  // Search box: local state debounced into the `q` URL param (FTS5 on the server).
  const [q, setQ] = React.useState(params.get("q") || "");
  React.useEffect(() => setQ(params.get("q") || ""), [params]); // chips/back-button stay in sync
  React.useEffect(() => {
    const t = setTimeout(() => { if (q !== (params.get("q") || "")) setFilter("q", q.trim()); }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const qs = new URLSearchParams(params);
    qs.set("page_size", PAGE_SIZE);
    getJSON(`/crusades?${qs.toString()}`).then(setData).catch(() => toast.error("Could not load crusades"));
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
  async function deleteReport(row) {
    if (!window.confirm(`Permanently delete the report for “${row.event_name || typeLabel(row.event_type)}”?`)) return;
    setDeleting(row.id);
    try {
      await deleteJSON(`/crusades/${row.id}`);
      setData((current) => ({ ...current, total: Math.max(current.total - 1, 0), rows: current.rows.filter((item) => item.id !== row.id) }));
      toast.success("Report deleted.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(null);
    }
  }
  const { Th } = useTableSort(params, setParams, "event_date");

  // Download every row matching the current filters (cookie authenticates the request).
  function exportRows(format) {
    const qs = new URLSearchParams(params);
    qs.set("format", format);
    qs.delete("page");
    const link = Object.assign(document.createElement("a"), { href: `/api/crusades/export?${qs.toString()}` });
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;
  const activeFilters = FILTERS.filter(([key]) => params.get(key));

  // If we arrived by clicking a dashboard breakdown row, show that widget in the trail.
  const fromWidgetId = Object.keys(DRILL_MAP).find((id) => params.get(DRILL_MAP[id].filterField));
  const crumbs = [{ label: "Reports dashboard", to: "/dashboard" }];
  if (fromWidgetId) crumbs.push({ label: WIDGETS[fromWidgetId].title, to: `/dashboard/widget/${fromWidgetId}` });
  crumbs.push({ label: "Reports" });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumbs items={crumbs} />
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">Crusade reports</h2><p className="mt-2 text-sm text-slate-600">The complete received record, from event context to ministry outcomes.</p></div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {data && <p className="mr-1 text-sm tabular-nums text-slate-500">{nfull.format(data.total)} matching</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => exportRows("csv")} disabled={!data?.total} title="Export matching rows as CSV">
            <Download /> CSV
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => exportRows("xlsx")} disabled={!data?.total} title="Export matching rows as Excel">
            <FileSpreadsheet /> Excel
          </Button>
        </div>
      </div>

      <section aria-label="Search and filter reports" className="border-y border-slate-200 bg-white print:hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-9"
              placeholder="Search crusade, venue, reporter, email, phone, KingsChat…" aria-label="Search crusades" />
          </div>
          <Button type="button" variant="outline" className="h-11 justify-between sm:min-w-40" aria-expanded={showFilters} aria-controls="report-filters" onClick={() => setShowFilters((value) => !value)}>
            <span className="flex items-center gap-2"><SlidersHorizontal /> Filters</span>
            {activeFilters.length > 0 && <span className="grid size-5 place-items-center rounded-full bg-blue-600 text-[11px] text-white">{activeFilters.length}</span>}
            <ChevronDown className={`size-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </Button>
        </div>
        {showFilters && <div id="report-filters" className="grid gap-x-5 gap-y-4 border-t border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {FILTERS.map(([key, label, kind, options]) => (
            <Field key={key} label={label}>
              {kind === "select" ? (
                <Select value={params.get(key) || ""} onChange={(e) => setFilter(key, e.target.value)}>
                  <option value="">Any</option>
                  {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              ) : (
                <Input type={kind} min={kind === "number" ? "0" : undefined} value={params.get(key) || ""} onChange={(e) => setFilter(key, e.target.value)}
                  placeholder={kind === "text" ? `Any ${label.toLowerCase()}` : kind === "number" ? "e.g. 1000" : undefined} />
              )}
            </Field>
          ))}
        </div>}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3">
            <span className="mr-1 text-xs font-medium text-slate-500">Applied</span>
            {activeFilters.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setFilter(key, "")}
                className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent">
                {label}: {params.get(key)} <X className="size-3" />
              </button>
            ))}
            <button type="button" onClick={() => setParams({})} className="text-xs font-medium text-muted-foreground hover:text-foreground">
              Clear all
            </button>
          </div>
        )}
      </section>

      <section aria-label="Crusade report records" className="border-y border-slate-200 bg-white">
        <div className="overflow-x-auto">
          {!data ? (
            <LoadingRows rows={8} />
          ) : !data.rows.length ? (
            <p className="py-16 text-center text-sm text-muted-foreground">No crusades match these filters.</p>
          ) : (
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-blue-200 bg-blue-50/80 text-left text-xs text-slate-600">
                  <Th col="event_date" label="Date" />
                  <Th col="event_name" label="Event name" />
                  <Th col="event_type" label="Type" />
                  <Th col="format" label="Format" />
                  <Th col="city" label="City / Country" />
                  <th className="py-2 pr-3 font-medium">Reporting type</th>
                  <th className="py-2 pr-3 font-medium">Reporter contact</th>
                  <Th col="attendance" label="Onsite" right />
                  {METRIC_COLS.map(([k, label]) => (
                    <Th key={k} col={k} label={label} right />
                  ))}
                  <Th col="minister_name" label="Minister" />
                  <Th col="venue" label="Venue" />
                  {admin?.is_super_admin && <th className="py-2 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-200 last:border-0 even:bg-slate-50/45">
                    <td className="py-2 pr-3 whitespace-nowrap">{r.event_date}</td>
                    <td className="max-w-40 truncate py-2 pr-3">{r.event_name}</td>
                    <td className="py-2 pr-3">{r.event_type === "other" ? r.other_event_type : typeLabel(r.event_type)}</td>
                    <td className="py-2 pr-3 capitalize">{r.format}</td>
                    <td className="max-w-48 truncate py-2 pr-3">{r.city}, {r.country}</td>
                    <td className="min-w-64 max-w-80 py-2 pr-3 text-xs">{orgHierarchy(r)}</td>
                    <td className="min-w-56 py-2 pr-3">
                      <div className="font-medium">{r.contact_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.contact_email || "—"}</div>
                      <div className="text-xs text-muted-foreground">{[r.phone_country_code, r.phone_number].filter(Boolean).join(" ") || "—"} · {r.kingschat_username ? `@${r.kingschat_username.replace(/^@/, "")}` : "—"}</div>
                    </td>
                    <td className="py-2 pr-3 text-right">{n0(r.attendance)}</td>
                    {METRIC_COLS.map(([k]) => (
                      <td key={k} className="py-2 pr-3 text-right">{n0(r[k])}</td>
                    ))}
                    <td className="max-w-32 truncate py-2 pr-3">{r.minister_name}</td>
                    <td className="max-w-32 truncate py-2">{r.venue}</td>
                    {admin?.is_super_admin && (
                      <td className="py-2 pl-3">
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/crusades/${r.id}/edit`)}>
                            <Pencil /> Edit
                          </Button>
                          <Button type="button" variant="destructive" size="sm" disabled={deleting === r.id} onClick={() => deleteReport(r)}>
                            <Trash2 /> {deleting === r.id ? "Deleting…" : "Delete report"}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {data && data.total > PAGE_SIZE && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
    </div>
  );
}
