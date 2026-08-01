import * as React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { getJSON } from "@/lib/api";

export function ManualOrganizations() {
  const [rows, setRows] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    setBusy(true);
    try { setRows((await getJSON("/registrations/manual-organizations")).rows || []); }
    catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Breadcrumbs items={[{ label: "Registrations", to: "/registrations" }, { label: "Manual organisations" }]} />
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-7">
        <div>
          <p className="text-sm font-semibold text-amber-700">Directory review</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Manual organisations</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Review zones and groups typed by registrants when they could not find a matching directory entry.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={busy}><RefreshCw className={busy ? "animate-spin" : ""} /> Refresh</Button>
      </header>
      <div className="flex items-center gap-3 border-l-4 border-amber-500 bg-amber-50/70 p-4 text-sm text-amber-900">
        <AlertCircle className="size-5 shrink-0" />
        <span>{rows === null ? "Loading submissions…" : `${rows.length} registration${rows.length === 1 ? "" : "s"} need directory review.`}</span>
      </div>
      <div className="overflow-x-auto border-y border-slate-200">
        {rows?.length ? (
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="px-3 py-3">Typed organisation</th><th className="px-3 py-3">Registration</th><th className="px-3 py-3">Crusade</th><th className="px-3 py-3">Location</th><th className="px-3 py-3">Submitted by</th><th className="px-3 py-3">Date</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-200 align-top">
              <td className="px-3 py-4"><div className="flex flex-wrap gap-2">{row.zone_manual ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Zone: {row.zone}</span> : null}{row.group_manual ? <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">Group: {row.group_name}</span> : null}</div></td>
              <td className="px-3 py-4 capitalize">{row.organization_type}</td>
              <td className="px-3 py-4"><p className="font-semibold text-slate-950">{row.event_name}</p><p className="mt-1 text-xs text-slate-500">{row.event_date}</p></td>
              <td className="px-3 py-4">{row.city || "—"}, {row.country || "—"}</td>
              <td className="px-3 py-4"><p className="font-medium">{row.contact_name || "—"}</p><p className="mt-1 text-xs text-slate-500">{row.contact_email || "—"}</p></td>
              <td className="whitespace-nowrap px-3 py-4 text-xs text-slate-500">{row.created_at}</td>
            </tr>)}</tbody>
          </table>
        ) : rows ? <div className="py-16 text-center text-sm text-slate-500">No manually entered organisations need review.</div> : <div className="py-16 text-center text-sm text-slate-500">Loading submissions…</div>}
      </div>
    </div>
  );
}
