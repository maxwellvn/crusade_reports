import * as React from "react";
import { AlertCircle, RefreshCw, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/Combobox";
import { getJSON, patchJSON } from "@/lib/api";

// Super-admin dashboard for reconciling manually-typed org names against the
// real zone/group directory. Registrants can type a group name if they can't
// find it in the directory (flagged group_manual); zones are directory-only.
// Here the admin maps each manual entry to the real directory zone/group —
// after creating it upstream in the churches API if needed — and saves.

export function ManualOrganizations() {
  const [rows, setRows] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(null); // registration_id being edited

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
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Map groups typed by registrants to the real directory entry. Create the group in the churches API first if it doesn't exist yet.</p>
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
            <thead><tr className="text-left text-xs text-slate-500"><th className="px-3 py-3">Typed organisation</th><th className="px-3 py-3">Registration</th><th className="px-3 py-3">Crusade</th><th className="px-3 py-3">Location</th><th className="px-3 py-3">Submitted by</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Actions</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-200 align-top">
              <td className="px-3 py-4"><div className="flex flex-wrap gap-2">{row.zone_manual ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Zone: {row.zone}</span> : null}{row.group_manual ? <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">Group: {row.group_name}</span> : null}</div></td>
              <td className="px-3 py-4 capitalize">{row.organization_type}</td>
              <td className="px-3 py-4"><p className="font-semibold text-slate-950">{row.event_name}</p><p className="mt-1 text-xs text-slate-500">{row.event_date}</p></td>
              <td className="px-3 py-4">{row.city || "—"}, {row.country || "—"}</td>
              <td className="px-3 py-4"><p className="font-medium">{row.contact_name || "—"}</p><p className="mt-1 text-xs text-slate-500">{row.contact_email || "—"}</p></td>
              <td className="whitespace-nowrap px-3 py-4 text-xs text-slate-500">{row.created_at}</td>
              <td className="px-3 py-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(row)}>
                  <Pencil /> Map to directory
                </Button>
              </td>
            </tr>)}</tbody>
          </table>
        ) : rows ? <div className="py-16 text-center text-sm text-slate-500">No manually entered organisations need review.</div> : <div className="py-16 text-center text-sm text-slate-500">Loading submissions…</div>}
      </div>
      {editing && <ReconcileDialog row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

// Reconciliation dialog: admin picks the real zone (and optionally group) from
// the directory, then saves to clear the manual flags and update the registration.
function ReconcileDialog({ row, onClose, onSaved }) {
  const ref = React.useRef(null);
  const [zones, setZones] = React.useState([]);
  const [groups, setGroups] = React.useState([]);
  const [zone, setZone] = React.useState("");
  const [group, setGroup] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { ref.current?.showModal(); }, []);
  React.useEffect(() => { getJSON("/zones").then(setZones).catch(() => toast.error("Could not load zones")); }, []);

  // When the admin picks a zone, load its groups from the directory.
  React.useEffect(() => {
    if (!zone) { setGroups([]); return; }
    getJSON(`/zones/groups?zone=${encodeURIComponent(zone)}`).then(setGroups).catch(() => setGroups([]));
  }, [zone]);

  const fetchZones = React.useCallback(
    (q) => Promise.resolve(zones.filter((z) => z.zone.toLowerCase().includes(q.toLowerCase())).map((z) => ({ value: z.zone, label: z.zone, sublabel: z.region }))),
    [zones],
  );
  const fetchGroups = React.useCallback(
    (q) => Promise.resolve(groups.filter((g) => g.name.toLowerCase().includes(q.toLowerCase())).map((g) => ({ value: g.id, label: g.name }))),
    [groups],
  );

  async function save() {
    if (!zone) { toast.error("Select a zone from the directory"); return; }
    setSaving(true);
    try {
      await patchJSON(`/registrations/manual-organizations/${row.registration_id}`, { zone, group_name: group || "" });
      toast.success("Organisation mapped to directory entry.");
      onSaved();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      className="w-[min(40rem,calc(100%-2rem))] border bg-background p-0 text-foreground backdrop:bg-black/60">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Map to directory entry</p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">{row.event_name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">Registration #{row.registration_id}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => ref.current?.close()} aria-label="Close">
          <X />
        </Button>
      </div>
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
          {row.zone_manual && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Typed zone: {row.zone}</span>}
          {row.group_manual && <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">Typed group: {row.group_name}</span>}
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Real zone (from directory)</label>
            <Combobox value={zone} placeholder="Select zone" searchPlaceholder="Search zones…" emptyText="No zones"
              fetcher={fetchZones} onSelect={(o) => { setZone(o.value); setGroup(""); }} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Real group (from directory)</label>
            <Combobox value={group} disabled={!zone} placeholder={zone ? "Select group" : "Pick a zone first"}
              searchPlaceholder="Search groups…" emptyText="No groups" fetcher={fetchGroups}
              onSelect={(o) => setGroup(o.label)} />
            <p className="mt-1.5 text-xs text-muted-foreground">Leave blank if the registration type doesn't use groups.</p>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t p-5">
        <Button type="button" variant="outline" onClick={() => ref.current?.close()}>Cancel</Button>
        <Button type="button" onClick={save} disabled={saving || !zone}>
          <Check /> {saving ? "Saving…" : "Map to directory"}
        </Button>
      </div>
    </dialog>
  );
}
