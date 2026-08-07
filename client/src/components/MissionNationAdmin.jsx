import * as React from "react";
import { ArrowUpDown, Download, FileDown, FileSpreadsheet, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Combobox } from "@/components/Combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { deleteJSON, getJSON, putJSON } from "@/lib/api";
import { useAdmin } from "@/components/AdminGate";
import { buildNotcReportHtml, openPrintReport } from "@/lib/printReportPdf";
import { nfull } from "@/lib/dashboardWidgets";

export function MissionNationAdmin() {
  const admin = useAdmin();
  const [data, setData] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [filters, setFilters] = React.useState({ mission_country: "", assigned_country: "", home_country: "", zone: "", date_from: "", date_to: "" });
  const [sort, setSort] = React.useState({ field: "created_at", direction: "desc" });
  const [assignment, setAssignment] = React.useState({ id: null, country_code: "" });
  const [savingAssignment, setSavingAssignment] = React.useState(false);
  const [savingWindow, setSavingWindow] = React.useState(false);
  const requestParams = React.useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    params.set("sort", sort.field); params.set("direction", sort.direction);
    return params;
  }, [query, filters, sort]);
  const load = React.useCallback(() => getJSON(`/mission-nations/admin?${requestParams}`).then(setData).catch((error) => toast.error(error.message)), [requestParams]);
  React.useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  async function toggleWindow() {
    setSavingWindow(true);
    try {
      const result = await putJSON("/mission-nations/admin/settings", { selection_open: !data.selection_open });
      setData((current) => ({ ...current, selection_open: result.selection_open }));
      toast.success(result.selection_open ? "Mission nation selection is open." : "Mission nation selection is closed.");
    } catch (error) { toast.error(error.message); } finally { setSavingWindow(false); }
  }

  async function remove(row) {
    if (!window.confirm(`Remove ${row.zone_name}'s mission nation preference?`)) return;
    try { await deleteJSON(`/mission-nations/admin/${row.id}`); await load(); toast.success("Mission nation preference removed."); }
    catch (error) { toast.error(error.message); }
  }

  async function saveAssignment(row, countryCode = assignment.country_code) {
    setSavingAssignment(true);
    try {
      await putJSON(`/mission-nations/admin/${row.id}/assignment`, { country_code: countryCode });
      const assigned = Boolean(countryCode);
      setAssignment({ id: null, country_code: "" }); await load();
      toast.success(assigned ? `${row.zone_name} assigned successfully.` : `${row.zone_name}'s assignment cleared.`);
    } catch (error) { toast.error(error.message); } finally { setSavingAssignment(false); }
  }

  function exportRows(format) {
    const params = new URLSearchParams(requestParams); params.set("format", format);
    const link = Object.assign(document.createElement("a"), { href: `/api/mission-nations/admin/export?${params}` });
    document.body.appendChild(link); link.click(); link.remove();
  }

  function exportPdf() {
    if (!data?.rows?.length) {
      toast.error("No mission nation preferences to export.");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const html = buildNotcReportHtml({
      eyebrow: "Night of a Thousand Crusades",
      title: "Mission nation preferences",
      meta: hasFilters
        ? `${nfull.format(data.filtered_total)} matching preferences · ${nfull.format(data.finalized_total)} of ${nfull.format(data.preference_total)} zones assigned.`
        : `${nfull.format(data.preference_total)} preferences · ${nfull.format(data.finalized_total)} final assignments.`,
      summary: [
        { label: "Preferences", value: nfull.format(data.preference_total) },
        { label: "Final assignments", value: nfull.format(data.finalized_total) },
        { label: "Shown in report", value: nfull.format(data.rows.length) },
      ],
      columns: [
        { header: "Receipt", key: "receipt_code" },
        { header: "Zone", key: "zone_name" },
        { header: "Minister", key: "pastor_name" },
        { header: "Home nation", key: "home_country_name" },
        { header: "Preferred nation", key: "mission_country_name" },
        { header: "Final assignment", value: (row) => row.assigned_country_name || "Not assigned" },
        { header: "Contact", value: (row) => `${row.contact_email} · ${row.phone_country_code} ${row.phone_number}` },
        { header: "Submitted", key: "created_at" },
      ],
      rows: data.rows,
      footer: "Prepared for Night of a Thousand Crusades (NOTC) mission nation assignment reporting.",
    });
    openPrintReport(html, `mission-nation-preferences-${date}`);
  }

  function setFilter(key, value) { setFilters((current) => ({ ...current, [key]: value })); }
  function clearFilters() { setQuery(""); setFilters({ mission_country: "", assigned_country: "", home_country: "", zone: "", date_from: "", date_to: "" }); }
  function changeSort(field) { setSort((current) => current.field === field ? { field, direction: current.direction === "asc" ? "desc" : "asc" } : { field, direction: "asc" }); }
  const hasFilters = Boolean(query.trim() || Object.values(filters).some(Boolean));
  const nations = data?.filter_options?.nations || [];
  const zones = data?.filter_options?.zones || [];

  function SortHeading({ field, children }) {
    const active = sort.field === field;
    return <button type="button" onClick={() => changeSort(field)} className={`inline-flex items-center gap-1 font-medium hover:text-slate-950 ${active ? "text-slate-950" : ""}`}>{children}<ArrowUpDown className={`size-3 ${active ? "opacity-100" : "opacity-40"}`} /><span className="sr-only">{active ? `, sorted ${sort.direction === "asc" ? "ascending" : "descending"}` : ""}</span></button>;
  }

  function AssignmentControl({ row, compact = false }) {
    if (assignment.id === row.id) return <div className={`flex gap-2 ${compact ? "mt-4 flex-col" : "min-w-64 items-center"}`}>
      <Combobox value={nations.find((nation) => nation.code === assignment.country_code)?.name || ""} fetcher={async (search) => nations.filter((nation) => nation.code !== row.home_country_code && nation.name.toLowerCase().includes(search.toLowerCase())).map((nation) => ({ value: nation.code, label: nation.name, sublabel: nation.continent }))} onSelect={(option) => setAssignment({ id: row.id, country_code: option.value })} placeholder="Search a nation…" searchPlaceholder="Search 242 nations…" />
      <div className="flex gap-1"><Button type="button" size="sm" disabled={savingAssignment || !assignment.country_code} onClick={() => saveAssignment(row)}>Save</Button>{row.assigned_country_code && <Button type="button" variant="ghost" size="sm" disabled={savingAssignment} onClick={() => saveAssignment(row, "")}>Clear</Button>}<Button type="button" variant="ghost" size="sm" onClick={() => setAssignment({ id: null, country_code: "" })}>Cancel</Button></div>
    </div>;
    return <div className={compact ? "mt-4" : ""}><p className="text-sm font-semibold text-slate-950">{row.assigned_country_name || "Not assigned"}</p><Button type="button" variant="link" size="sm" className="h-auto px-0 py-1 text-xs" onClick={() => setAssignment({ id: row.id, country_code: row.assigned_country_code || row.mission_country_code })}>{row.assigned_country_code ? "Reassign" : "Assign nation"}</Button></div>;
  }

  return <div className="mx-auto max-w-6xl">
    <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Mission nations" }]} />
    <div className="flex flex-col gap-5 pb-10 pt-6 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-3xl font-normal tracking-[-0.03em] text-slate-950 sm:text-4xl">Mission nation preferences</h2><p className="mt-2 text-sm text-slate-600">Review each zone's preference, then make or revise its final assignment.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="rounded-full" onClick={() => exportRows("csv")} disabled={!data?.filtered_total}><Download /> CSV</Button><Button variant="outline" className="rounded-full" onClick={() => exportRows("xlsx")} disabled={!data?.filtered_total}><FileSpreadsheet /> Excel</Button><Button variant="outline" className="rounded-full" onClick={exportPdf} disabled={!data?.filtered_total}><FileDown /> PDF</Button></div></div>

    <section className="grid gap-5 border-t border-slate-200 py-8 sm:grid-cols-[15rem_minmax(0,1fr)] sm:gap-10 sm:py-10"><div><h3 className="text-base font-semibold text-slate-950">Selection window</h3><p className="mt-2 text-sm leading-6 text-slate-600">Closing the window blocks new preferences. Existing submissions and final assignments remain unchanged.</p></div><div className="flex items-center justify-between gap-6 border-b border-slate-200 pb-6"><div><p className="text-sm font-semibold text-slate-950">{!data ? "Checking status…" : data.selection_open ? "Selection is open" : "Selection is closed"}</p><p className="mt-1 text-sm text-slate-600">{data?.selection_open ? "Ministers from zones and networks can currently submit a preferred nation." : "Administrators can continue making final assignments."}</p></div>{admin?.is_super_admin && <button type="button" role="switch" aria-checked={Boolean(data?.selection_open)} disabled={!data || savingWindow} onClick={toggleWindow} className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4 disabled:opacity-50 ${data?.selection_open ? "border-slate-950 bg-slate-950" : "border-slate-300 bg-slate-200"}`}><span className={`absolute top-1 block size-4 rounded-full bg-white transition-transform ${data?.selection_open ? "translate-x-6" : "translate-x-1"}`} /><span className="sr-only">{data?.selection_open ? "Close selection" : "Open selection"}</span></button>}</div></section>

    <section className="border-t border-slate-200 py-8 sm:py-10">
      <div><h3 className="text-base font-semibold text-slate-950">Submitted preferences and assignments</h3><p className="mt-2 text-sm text-slate-600">{data ? hasFilters ? `${data.filtered_total} matching · ${data.finalized_total} of ${data.preference_total} zones assigned` : `${data.preference_total} preferences · ${data.finalized_total} final assignments` : "Loading submissions…"}</p></div>
      <div className="mt-6 border-y border-slate-200 py-5">
        <label className="relative block"><span className="sr-only">Search submissions</span><Search className="absolute left-0 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search receipt, zone, pastor, nation or contact" className="rounded-none border-x-0 border-t-0 bg-transparent pl-7 shadow-none focus-visible:ring-0" />{query && <button type="button" onClick={() => setQuery("")} className="absolute right-0 top-1/2 grid size-9 -translate-y-1/2 place-items-center text-slate-500 hover:text-slate-950" aria-label="Clear search"><X className="size-4" /></button>}</label>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Field label="Preferred nation"><Select value={filters.mission_country} onChange={(event) => setFilter("mission_country", event.target.value)}><option value="">Any preference</option>{nations.map((nation) => <option key={nation.code} value={nation.code}>{nation.name}</option>)}</Select></Field>
          <Field label="Assigned nation"><Select value={filters.assigned_country} onChange={(event) => setFilter("assigned_country", event.target.value)}><option value="">Any assignment</option>{nations.map((nation) => <option key={nation.code} value={nation.code}>{nation.name}</option>)}</Select></Field>
          <Field label="Home nation"><Select value={filters.home_country} onChange={(event) => setFilter("home_country", event.target.value)}><option value="">Any home nation</option>{nations.map((nation) => <option key={nation.code} value={nation.code}>{nation.name}</option>)}</Select></Field>
          <Field label="Zone"><Select value={filters.zone} onChange={(event) => setFilter("zone", event.target.value)}><option value="">Any zone</option>{zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</Select></Field>
          <Field label="Submitted from"><Input type="date" value={filters.date_from} onChange={(event) => setFilter("date_from", event.target.value)} /></Field>
          <Field label="Submitted to"><Input type="date" value={filters.date_to} onChange={(event) => setFilter("date_to", event.target.value)} /></Field>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><Field label="Sort records" className="w-full sm:w-56"><Select value={`${sort.field}:${sort.direction}`} onChange={(event) => { const [field, direction] = event.target.value.split(":"); setSort({ field, direction }); }}><option value="created_at:desc">Newest first</option><option value="created_at:asc">Oldest first</option><option value="mission_nation:asc">Preferred nation A–Z</option><option value="mission_nation:desc">Preferred nation Z–A</option><option value="assigned_nation:asc">Assigned nation A–Z</option><option value="zone:asc">Zone A–Z</option><option value="zone:desc">Zone Z–A</option><option value="pastor:asc">Pastor A–Z</option><option value="home_nation:asc">Home nation A–Z</option></Select></Field>{hasFilters && <Button type="button" variant="ghost" size="sm" onClick={clearFilters}><X /> Clear filters</Button>}</div>
      </div>
      <div className="mt-6 border-y border-slate-200">{!data ? <div className="space-y-px"><Skeleton className="h-16 rounded-none" /><Skeleton className="h-16 rounded-none" /><Skeleton className="h-16 rounded-none" /></div> : data.rows.length ? <><div className="sm:hidden">{data.rows.map((row) => <article key={row.id} className="border-b border-slate-200 py-5 last:border-0"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{row.receipt_code}</p><h4 className="mt-2 font-semibold text-slate-950">{row.zone_name}</h4><p className="mt-1 text-sm text-slate-600">Prefers {row.mission_country_name}</p></div>{admin?.is_super_admin && <Button type="button" variant="ghost" size="icon" onClick={() => remove(row)} className="shrink-0 text-slate-500 hover:text-red-700" aria-label={`Remove ${row.zone_name}'s preference`}><Trash2 /></Button>}</div><dl className="mt-4 grid grid-cols-[7rem_1fr] gap-y-2 text-xs"><dt className="text-slate-500">Minister</dt><dd className="font-medium text-slate-800">{row.pastor_name}</dd><dt className="text-slate-500">Home nation</dt><dd className="font-medium text-slate-800">{row.home_country_name}</dd><dt className="text-slate-500">Contact</dt><dd className="min-w-0 break-words font-medium text-slate-800">{row.contact_email}<br />{row.phone_country_code} {row.phone_number}<br />@{row.kingschat_username}</dd><dt className="text-slate-500">Submitted</dt><dd className="font-medium text-slate-800">{row.created_at}</dd></dl><AssignmentControl row={row} compact /></article>)}</div><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[1240px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="px-3 py-3 font-medium">Receipt</th><th className="px-3 py-3"><SortHeading field="zone">Zone / Minister</SortHeading></th><th className="px-3 py-3"><SortHeading field="home_nation">Home nation</SortHeading></th><th className="px-3 py-3"><SortHeading field="mission_nation">Preferred nation</SortHeading></th><th className="px-3 py-3"><SortHeading field="assigned_nation">Final assignment</SortHeading></th><th className="px-3 py-3 font-medium">Contact</th><th className="px-3 py-3"><SortHeading field="created_at">Submitted</SortHeading></th>{admin?.is_super_admin && <th className="px-3 py-3 font-medium">Action</th>}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className="border-b border-slate-200 align-top last:border-0"><td className="whitespace-nowrap px-3 py-4 text-xs font-semibold text-slate-700">{row.receipt_code}</td><td className="px-3 py-4"><p className="font-semibold text-slate-950">{row.zone_name}</p><p className="mt-1 text-xs text-slate-500">{row.pastor_name}</p></td><td className="px-3 py-4">{row.home_country_name}</td><td className="px-3 py-4"><p className="font-semibold text-slate-950">{row.mission_country_name}</p><p className="mt-1 text-xs text-slate-500">Stated preference</p></td><td className="px-3 py-4"><AssignmentControl row={row} /></td><td className="max-w-60 px-3 py-4"><p className="truncate">{row.contact_email}</p><p className="mt-1 text-xs text-slate-500">{row.phone_country_code} {row.phone_number} · @{row.kingschat_username}</p></td><td className="whitespace-nowrap px-3 py-4 text-xs text-slate-500">{row.created_at}</td>{admin?.is_super_admin && <td className="px-3 py-4"><Button type="button" variant="ghost" size="sm" onClick={() => remove(row)} className="text-slate-600 hover:text-red-700"><Trash2 /> Remove</Button></td>}</tr>)}</tbody></table></div></> : <div className="py-16 text-center"><p className="font-semibold text-slate-950">No preferences found</p><p className="mt-2 text-sm text-slate-600">{hasFilters ? "Change or clear the active filters." : "Submissions will appear here as ministers state their preferred nations."}</p></div>}</div>
    </section>
  </div>;
}
