import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Eye, X, Search, Download, FileSpreadsheet } from "lucide-react";
import { useTableSort, Pagination } from "@/lib/tableTools";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { LoadingRows } from "@/components/ui/skeleton";
import { getJSON } from "@/lib/api";
import { CRUSADE_TYPES } from "@/lib/constants";
import { typeLabel, nfull, orgHierarchy } from "@/lib/dashboardWidgets";

// Super-admin-only table of Loveworld Blue Elite staff registrations.
// Reads from /api/blue-elite/registrations, which is server-scoped to
// program='blue_elite'. Same filter/sort/pagination pattern as the public
// RegistrationsTable, but with a Department filter and no edit/delete actions
// (read-only for now — report submission against Blue Elite rows is a later
// concern).

const STATUSES = [["confirmed", "Confirmed"], ["pending", "Pending confirmation"], ["preparing", "Preparing"], ["ready", "Ready"], ["holding", "Holding as planned"], ["not_holding", "Not holding"]];
const REPORT_STATUSES = [["reported", "Report submitted"], ["unreported", "Report not submitted"]];
const STATUS_COLORS = {
  confirmed: "border-teal-300 bg-teal-50 text-teal-700",
  pending: "border-slate-300 bg-slate-100 text-slate-700",
  preparing: "border-amber-300 bg-amber-50 text-amber-700",
  ready: "border-emerald-300 bg-emerald-50 text-emerald-700",
  holding: "border-blue-300 bg-blue-50 text-blue-700",
  not_holding: "border-red-300 bg-red-50 text-red-700",
};
const FILTERS = [
  ["readiness_status", "Readiness", "select", STATUSES],
  ["report_status", "Report status", "select", REPORT_STATUSES],
  ["zone", "Zone", "text"],
  ["group_name", "Group", "text"],
  ["church_name", "Church", "text"],
  ["department", "Department", "text"],
  ["country", "Country", "text"],
  ["city", "City", "text"],
  ["event_type", "Crusade type", "select", CRUSADE_TYPES],
  ["min_attendance", "Min expected attendance", "number"],
  ["date_from", "Crusade date from", "date"],
  ["date_to", "Crusade date to", "date"],
];
const PAGE_SIZE = 50;

export function BlueEliteRegistrationsTable() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
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
    getJSON(`/blue-elite/registrations?${qs.toString()}`).then(setData).catch(() => toast.error("Could not load Blue Elite registrations"));
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

  function exportRows(format) {
    const qs = new URLSearchParams(params);
    qs.set("format", format);
    qs.delete("page");
    const link = Object.assign(document.createElement("a"), { href: `/api/blue-elite/registrations/export?${qs.toString()}` });
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;
  const activeFilters = FILTERS.filter(([key]) => params.get(key));
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Breadcrumbs items={[{ label: "Blue Elite dashboard", to: "/dashboard/blue-elite" }, { label: "Registered crusades" }]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Blue Elite — registered crusades</h2>
        <div className="flex items-center gap-2">
          {data && <p className="text-sm text-muted-foreground">{nfull.format(data.total)} matching</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => exportRows("csv")} disabled={!data?.total} title="Export matching rows as CSV">
            <Download /> CSV
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => exportRows("xlsx")} disabled={!data?.total} title="Export matching rows as Excel">
            <FileSpreadsheet /> Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-6"
              placeholder="Search crusade, venue, department, staff or contact…" aria-label="Search Blue Elite registrations" />
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
                <Input type={kind} min={kind === "number" ? "0" : undefined} value={params.get(key) || ""} onChange={(e) => setFilter(key, e.target.value)}
                  placeholder={kind === "text" ? `Any ${label.toLowerCase()}` : kind === "number" ? "e.g. 1000" : undefined} />
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
            <p className="py-16 text-center text-sm text-muted-foreground">No Blue Elite registrations match these filters.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <Th col="event_date" label="Date" />
                  <Th col="event_name" label="Crusade" />
                  <Th col="event_type" label="Type" />
                  <Th col="country" label="Country" />
                  <th className="py-2 pr-3 font-medium">City / venue</th>
                  <Th col="expected_attendance" label="Expected" right />
                  <th className="py-2 pr-3 font-medium">Readiness</th>
                  <th className="py-2 pr-3 font-medium">Report</th>
                  <th className="py-2 pr-3 font-medium">Department</th>
                  <th className="py-2 pr-3 font-medium">Team</th>
                  <th className="py-2 pr-3 font-medium">Staff</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{r.event_date || "—"}</td>
                    <td className="max-w-52 py-2 pr-3">
                      <div className="font-medium">{r.event_name || typeLabel(r.event_type)}</div>
                      {r.planned_count > 1 && <div className="text-xs text-muted-foreground">Legacy aggregate: {nfull.format(r.planned_count)}</div>}
                    </td>
                    <td className="max-w-44 py-2 pr-3">{typeLabel(r.event_type)}</td>
                    <td className="max-w-40 py-2 pr-3">{r.country || "—"}</td>
                    <td className="max-w-60 py-2 pr-3 text-muted-foreground">{[r.city, r.venue].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="py-2 pr-3 text-right font-medium">{nfull.format(r.expected_attendance || 0)}</td>
                    <td className="py-2 pr-3"><StatusBadge status={r.readiness_status} /></td>
                    <td className="py-2 pr-3">
                      {r.report_submitted ? (
                        <span className="inline-flex whitespace-nowrap border border-green-300 bg-green-50 px-2 py-1 text-xs font-medium text-green-700">Submitted</span>
                      ) : (
                        <span className="inline-flex whitespace-nowrap border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Awaiting</span>
                      )}
                    </td>
                    <td className="max-w-40 py-2 pr-3">{r.department || "—"}</td>
                    <td className="min-w-56 max-w-72 py-2 pr-3 text-xs">{orgHierarchy(r)}</td>
                    <td className="max-w-48 py-2 pr-3">
                      <div className="truncate font-medium">{r.contact_name || "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.kingschat_username ? `@${r.kingschat_username.replace(/^@/, "")}` : "No KingsChat"}</div>
                    </td>
                    <td className="py-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setSelected(r)}>
                        <Eye /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {data && data.total > PAGE_SIZE && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
      {selected && <CrusadeDetails crusade={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StatusBadge({ status = "pending" }) {
  return <span className={`inline-flex whitespace-nowrap border px-2 py-1 text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.pending}`}>
    {STATUSES.find(([value]) => value === status)?.[1] || "Pending confirmation"}
  </span>;
}

function CrusadeDetails({ crusade, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current?.showModal(); }, []);

  const details = [
    ["Crusade type", typeLabel(crusade.event_type)],
    ["Date", crusade.event_date],
    ["Expected attendance", nfull.format(crusade.expected_attendance || 0)],
    ["City", crusade.city],
    ["Venue / address", crusade.venue],
    ["Ministers", crusade.minister_name],
    ["Department", crusade.department],
    ["Organization", crusade.org],
    ["Country", crusade.country],
    ["Registered", crusade.registered_at?.slice(0, 10)],
    ["Staff name", crusade.contact_name],
    ["Report", crusade.report_submitted ? "Submitted" : "Submit report"],
    ["Email", crusade.contact_email],
    ["Phone", [crusade.phone_country_code, crusade.phone_number].filter(Boolean).join(" ")],
    ["KingsChat", crusade.kingschat_username],
  ];

  return (
    <dialog ref={ref} onClose={onClose} onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      className="w-[min(42rem,calc(100%-2rem))] border bg-background p-0 text-foreground backdrop:bg-black/60">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Blue Elite crusade details</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">{crusade.event_name || typeLabel(crusade.event_type)}</h3>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => ref.current?.close()} aria-label="Close details">
          <X />
        </Button>
      </div>
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={crusade.readiness_status} />
          {crusade.planned_count > 1 && <span className="text-xs text-muted-foreground">Legacy aggregate: {nfull.format(crusade.planned_count)} crusades</span>}
        </div>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words text-sm">{value || "—"}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Readiness details / challenges</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{crusade.readiness_notes || "No readiness feedback yet."}</p>
        </div>
      </div>
    </dialog>
  );
}
