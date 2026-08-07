import * as React from "react";
import { Download, FileDown, FileSpreadsheet, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/components/AdminGate";
import { deleteJSON, getJSON } from "@/lib/api";
import { buildNotcReportHtml, openPrintReport } from "@/lib/printReportPdf";
import { nfull } from "@/lib/dashboardWidgets";

const DEFAULT_ROLES = ["Presenter", "Cameraman", "Technical Personnel"];

export function MediaTrainingAdmin() {
  const admin = useAdmin();
  const [data, setData] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [role, setRole] = React.useState("");
  const [zone, setZone] = React.useState("");
  const [sort, setSort] = React.useState("created_at:desc");
  const params = React.useMemo(() => { const p = new URLSearchParams(); if (query.trim()) p.set("q", query.trim()); if (role) p.set("role", role); if (zone) p.set("zone", zone); const [field, direction] = sort.split(":"); p.set("sort", field); p.set("direction", direction); return p; }, [query, role, zone, sort]);
  const load = React.useCallback(() => getJSON(`/media-training/admin?${params}`).then(setData).catch((error) => toast.error(error.message)), [params]);
  React.useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);
  function exportRows(format) { const p = new URLSearchParams(params); p.set("format", format); window.location.assign(`/api/media-training/admin/export?${p}`); }
  function exportPdf() {
    if (!data?.rows?.length) {
      toast.error("No media-training registrations to export.");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const html = buildNotcReportHtml({
      eyebrow: "Night of a Thousand Crusades",
      title: "Global Media Training registrations",
      meta: hasFilters
        ? `${nfull.format(data.filtered_total)} matching of ${nfull.format(data.registrations)} registrations (August 24).`
        : `${nfull.format(data.registrations)} individual registrations for August 24 Global Media Training.`,
      summary: [
        { label: "Registrations", value: nfull.format(data.registrations) },
        { label: "Shown in report", value: nfull.format(data.rows.length) },
        { label: "Matching filters", value: nfull.format(data.filtered_total) },
      ],
      columns: [
        { header: "Zone", key: "zone_name" },
        { header: "Ministry / reference", value: (row) => row.organization_name === row.zone_name ? row.reference_code : `${row.organization_name} · ${row.reference_code}` },
        { header: "Trainee", key: "full_name" },
        { header: "Role", key: "role" },
        { header: "Location", value: (row) => `${row.church_city}, ${row.church_country_name}` },
        { header: "Languages", value: (row) => row.languages_spoken || "—" },
        { header: "Contact", value: (row) => `${row.email}${row.kingschat_username ? ` · @${row.kingschat_username}` : ""} · ${row.phone_country_code} ${row.phone_number}` },
        { header: "Submitted", key: "created_at" },
      ],
      rows: data.rows,
      footer: "Prepared for Night of a Thousand Crusades (NOTC) Global Media Training reporting.",
    });
    openPrintReport(html, `global-media-training-registrations-${date}`);
  }
  async function remove(row) { if (!window.confirm(`Remove ${row.full_name}'s media-training registration?`)) return; try { await deleteJSON(`/media-training/admin/${row.registration_id}`); await load(); toast.success("Registration removed."); } catch (error) { toast.error(error.message); } }
  const hasFilters = Boolean(query || role || zone);

  return <div className="mx-auto max-w-6xl">
    <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Media training" }]} />
    <header className="flex flex-col gap-5 pb-10 pt-6 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-3xl font-normal tracking-[-0.03em] text-slate-950 sm:text-4xl">Global Media Training</h2><p className="mt-2 text-sm text-slate-600">August 24 individual registrations.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="rounded-full" disabled={!data?.filtered_total} onClick={() => exportRows("csv")}><Download /> CSV</Button><Button variant="outline" className="rounded-full" disabled={!data?.filtered_total} onClick={() => exportRows("xlsx")}><FileSpreadsheet /> Excel</Button><Button variant="outline" className="rounded-full" disabled={!data?.filtered_total} onClick={exportPdf}><FileDown /> PDF</Button></div></header>
    <section className="border-y border-slate-200 py-6"><div className="grid gap-5 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"><Field label="Search registrations"><div className="relative"><Search className="absolute left-0 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zone, trainee, email or KingsChat" className="pl-7" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-0 top-1/2 grid size-9 -translate-y-1/2 place-items-center"><X className="size-4" /></button>}</div></Field><Field label="Zone"><Select value={zone} onChange={(event) => setZone(event.target.value)}><option value="">All zones</option>{(data?.filter_options?.zones || []).map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Role"><Select value={role} onChange={(event) => setRole(event.target.value)}><option value="">All roles</option>{[...new Set([...DEFAULT_ROLES, ...(data?.filter_options?.roles || [])])].map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Sort"><Select value={sort} onChange={(event) => setSort(event.target.value)}><option value="created_at:desc">Newest first</option><option value="created_at:asc">Oldest first</option><option value="zone:asc">Zone A–Z</option><option value="trainee:asc">Trainee A–Z</option><option value="role:asc">Role A–Z</option></Select></Field></div></section>
    <div className="flex flex-wrap gap-6 py-6 text-sm"><p><strong className="text-2xl font-medium text-slate-950">{data?.registrations ?? "—"}</strong><span className="ml-2 text-slate-500">registrations</span></p>{hasFilters && <p className="self-center text-slate-500">{data?.filtered_total ?? 0} matching</p>}</div>
    <div className="border-y border-slate-200">{!data ? <div className="space-y-px"><Skeleton className="h-16 rounded-none" /><Skeleton className="h-16 rounded-none" /></div> : data.rows.length ? <><div className="sm:hidden">{data.rows.map((row) => <article key={row.trainee_id} className="border-b border-slate-200 py-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-blue-700">{row.role}</p><h3 className="mt-2 font-semibold text-slate-950">{row.full_name}</h3><p className="mt-1 text-sm text-slate-600">{row.zone_name}</p></div>{admin?.is_super_admin && <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${row.full_name}'s registration`} className="text-slate-500 hover:text-red-700" onClick={() => remove(row)}><Trash2 /></Button>}</div><dl className="mt-4 grid grid-cols-[6rem_1fr] gap-y-2 text-xs"><dt className="text-slate-500">Group/Church</dt><dd>{row.organization_name === row.zone_name ? "—" : row.organization_name}</dd><dt className="text-slate-500">Location</dt><dd>{row.church_city}, {row.church_country_name}</dd><dt className="text-slate-500">Languages</dt><dd>{row.languages_spoken || "—"}</dd><dt className="text-slate-500">Email</dt><dd className="break-all">{row.email}</dd><dt className="text-slate-500">KingsChat</dt><dd>{row.kingschat_username ? "@" + row.kingschat_username : "—"}</dd><dt className="text-slate-500">Phone</dt><dd>{row.phone_country_code} {row.phone_number}</dd></dl></article>)}</div>
      <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[1000px] text-sm"><thead><tr className="text-left text-xs"><th className="px-3 py-3">Zone / Ministry</th><th className="px-3 py-3">Trainee</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Submitted</th>{admin?.is_super_admin && <th className="px-3 py-3">Action</th>}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.trainee_id} className="border-t border-slate-200 align-top"><td className="px-3 py-4"><p className="font-semibold text-slate-950">{row.zone_name}</p><p className="mt-1 text-xs text-slate-500">{row.organization_name === row.zone_name ? row.reference_code : row.organization_name + " · " + row.reference_code}</p><p className="mt-1 text-xs text-slate-500">{row.church_city}, {row.church_country_name}</p></td><td className="px-3 py-4 font-semibold">{row.full_name}</td><td className="px-3 py-4"><p>{row.role}</p><p className="mt-1 text-xs text-slate-500">{row.languages_spoken || "—"}</p></td><td className="px-3 py-4"><p>{row.email}</p><p className="mt-1 text-xs text-slate-500">{row.kingschat_username ? "@" + row.kingschat_username + " · " : ""}{row.phone_country_code} {row.phone_number}</p></td><td className="whitespace-nowrap px-3 py-4 text-xs text-slate-500">{row.created_at}</td>{admin?.is_super_admin && <td className="px-3 py-4"><Button type="button" variant="ghost" size="sm" className="text-slate-600 hover:text-red-700" onClick={() => remove(row)}><Trash2 /> Remove</Button></td>}</tr>)}</tbody></table></div></> : <div className="py-16 text-center"><p className="font-semibold text-slate-950">No registrations found</p><p className="mt-2 text-sm text-slate-600">{hasFilters ? "Change or clear the active filters." : "Training registrations will appear here."}</p></div>}</div>
  </div>;
}
