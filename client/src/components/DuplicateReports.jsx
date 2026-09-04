import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Copy, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingRows } from "@/components/ui/skeleton";
import { deleteJSON, getJSON } from "@/lib/api";
import { typeLabel, nfull, orgHierarchy } from "@/lib/dashboardWidgets";
import { Pagination } from "@/lib/tableTools";

const PAGE_SIZE = 25;

export function DuplicateReports() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [deleting, setDeleting] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const page = Math.max(parseInt(params.get("page"), 10) || 1, 1);
  const [query, setQuery] = React.useState(params.get("q") || "");

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
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    let current = true;
    const request = new URLSearchParams(params);
    request.set("page_size", PAGE_SIZE);
    setLoading(true);
    getJSON(`/crusades/duplicates?${request.toString()}`)
      .then((result) => {
        if (!current) return;
        if (!result.rows.length && result.total > 0 && page > 1) {
          const next = new URLSearchParams(params);
          next.set("page", String(page - 1));
          setParams(next);
          return;
        }
        setData(result);
      })
      .catch((error) => current && toast.error(error.message || "Could not load duplicate reports."))
      .finally(() => current && setLoading(false));
    return () => { current = false; };
  }, [params, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  function setPage(nextPage) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  }

  async function removeReport(row) {
    const position = row.id === row.keeper_id ? "the earliest entry" : "a later duplicate";
    if (!window.confirm(`Permanently delete ${position} for “${row.event_name}” in ${row.city}, ${row.country}?`)) return;
    setDeleting(row.id);
    try {
      await deleteJSON(`/crusades/${row.id}`);
      toast.success("Report deleted and duplicate totals refreshed.");
      setReload((value) => value + 1);
    } catch (error) {
      toast.error(error.message || "Could not delete the report.");
    } finally {
      setDeleting(null);
    }
  }

  const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Duplicate reports" }]} />

      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-start gap-3">
          <div className="mt-1 grid size-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800"><Copy className="size-5" /></div>
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">Duplicate reports</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Only reports sharing the same date, event name, country and city are shown. Matching ignores capitalization and spaces at the start or end.</p>
          </div>
        </div>
      </header>

      <section aria-label="Duplicate report summary" className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3">
        {[
          ["Duplicate sets", data?.duplicate_groups],
          ["Reports shown", data?.total],
          ["Extra reports", data?.excess_reports],
        ].map(([label, value]) => (
          <div key={label} className="bg-white px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{data ? nfull.format(value || 0) : "—"}</p>
          </div>
        ))}
      </section>

      <section aria-label="Search duplicate reports" className="border-y border-slate-200 bg-white p-4">
        <div className="relative max-w-2xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 pl-9" aria-label="Search duplicate reports" placeholder="Search event, location, organisation or reporter…" />
        </div>
      </section>

      <section aria-label="Duplicate report records" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          {loading && !data ? (
            <LoadingRows rows={8} />
          ) : !data?.rows.length ? (
            <div className="px-6 py-16 text-center">
              <p className="font-medium text-slate-900">No duplicate reports found</p>
              <p className="mt-1 text-sm text-slate-500">Every matching report currently appears only once.</p>
            </div>
          ) : (
            <table className="w-full min-w-[1050px] text-sm">
              <thead>
                <tr className="border-b border-blue-200 bg-blue-50/80 text-left text-xs text-blue-950">
                  <th className="px-4 py-3 font-medium">Duplicate set</th>
                  <th className="py-3 pr-4 font-medium">Submitted</th>
                  <th className="py-3 pr-4 font-medium">Event</th>
                  <th className="py-3 pr-4 font-medium">Location</th>
                  <th className="py-3 pr-4 font-medium">Reporting type</th>
                  <th className="py-3 pr-4 font-medium">Reporter</th>
                  <th className="py-3 pr-4 text-right font-medium">Onsite</th>
                  <th className="py-3 pr-4 text-right font-medium">Online</th>
                  <th className="py-3 pr-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-200 last:border-0 even:bg-slate-50/45">
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${row.id === row.keeper_id ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {row.id === row.keeper_id ? "Earliest · keep" : `Duplicate · ${row.duplicate_count} total`}
                      </span>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-600">{row.submitted_at || "—"}</td>
                    <td className="max-w-64 py-3 pr-4"><p className="font-medium text-slate-950">{row.event_name}</p><p className="mt-0.5 text-xs text-slate-500">{row.event_type === "other" ? row.other_event_type : typeLabel(row.event_type)} · {row.event_date}</p></td>
                    <td className="max-w-48 py-3 pr-4">{row.city}, {row.country}</td>
                    <td className="min-w-56 max-w-72 py-3 pr-4 text-xs text-slate-600">{orgHierarchy(row)}</td>
                    <td className="min-w-48 py-3 pr-4"><p>{row.contact_name || "—"}</p><p className="text-xs text-slate-500">{row.contact_email || (row.kingschat_username ? `@${row.kingschat_username.replace(/^@/, "")}` : "—")}</p></td>
                    <td className="py-3 pr-4 text-right">{nfull.format(row.attendance || 0)}</td>
                    <td className="py-3 pr-4 text-right">{nfull.format(row.online_participation || 0)}</td>
                    <td className="py-3 pr-4">
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/crusades/${row.id}/edit`)}><Pencil /> Edit</Button>
                        <Button type="button" variant="destructive" size="sm" disabled={deleting === row.id} onClick={() => removeReport(row)}><Trash2 /> {deleting === row.id ? "Deleting…" : "Delete"}</Button>
                      </div>
                    </td>
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
