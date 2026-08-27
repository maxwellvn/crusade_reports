import * as React from "react";
import { DatabaseBackup, Download, HardDriveUpload, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, getJSON, postJSON } from "@/lib/api";

const bytes = (value) => value ? `${(value / 1024 / 1024).toFixed(1)} MB` : "—";
const date = (value) => value ? new Date(value).toLocaleString() : "Not yet completed";

export function DatabaseProtection() {
  const [status, setStatus] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [file, setFile] = React.useState(null);
  const [registrationFile, setRegistrationFile] = React.useState(null);
  const [confirmation, setConfirmation] = React.useState("");

  const load = React.useCallback(() => getJSON("/admin/database-protection").then(setStatus).catch((error) => toast.error(error.message)), []);
  React.useEffect(() => { load(); }, [load]);

  async function backup() {
    setBusy(true);
    try { await postJSON("/admin/database-protection/backup", {}); await load(); toast.success("Verified database backup created."); }
    catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  }

  async function restore(event) {
    event.preventDefault();
    if (!file) return toast.error("Choose a SQLite backup first.");
    setBusy(true);
    const body = new FormData();
    body.append("backup", file);
    if (registrationFile) body.append("registrationBackup", registrationFile);
    body.append("confirmation", confirmation);
    try {
      const result = await api("/admin/database-protection/restore", { method: "POST", body });
      toast.success(result.message);
      setTimeout(() => window.location.reload(), 5000);
    } catch (error) { toast.error(error.message); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Database protection" }]} />
      <header className="border-b border-slate-200 pb-7">
        <p className="text-sm font-semibold text-blue-700">Super-admin controls</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Database protection</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Create verified recovery points, keep an offline copy, or restore a known-good SQLite backup.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="border-l-4 border-emerald-500 bg-emerald-50/70 p-5"><ShieldCheck className="text-emerald-700" /><p className="mt-4 text-xs font-semibold uppercase tracking-wider text-emerald-800">Protection state</p><p className="mt-1 text-lg font-semibold text-emerald-950">{status?.state || "Checking…"}</p></div>
        <div className="border-l-4 border-blue-500 bg-blue-50/70 p-5"><DatabaseBackup className="text-blue-700" /><p className="mt-4 text-xs font-semibold uppercase tracking-wider text-blue-800">Last verified backup</p><p className="mt-1 text-sm font-semibold text-blue-950">{date(status?.last_success_at)}</p></div>
        <div className="border-l-4 border-amber-500 bg-amber-50/70 p-5"><RefreshCw className="text-amber-700" /><p className="mt-4 text-xs font-semibold uppercase tracking-wider text-amber-800">Latest size</p><p className="mt-1 text-lg font-semibold text-amber-950">{bytes(status?.latest_bytes)}</p>{status?.split_database && <p className="mt-1 text-xs text-amber-900">Registrations: {bytes(status?.latest_registration_bytes)}</p>}</div>
      </section>

      {status?.last_error && <p className="border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-800">{status.last_error}</p>}

      <section className="grid gap-6 border-t border-slate-200 pt-8 md:grid-cols-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Create and keep a backup</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">Backups are consistency-checked before they are retained. Download regularly to keep a copy outside this server.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={backup} disabled={busy}><DatabaseBackup />{busy ? "Working…" : "Back up now"}</Button>
            {!status?.split_database && <Button asChild variant="outline"><a href="/api/admin/database-protection/download"><Download />Create & download</a></Button>}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Automatic policy: 48 recent, 30 daily, and 12 weekly recovery points.</p>
        </div>

        <form onSubmit={restore} className="border-l-4 border-rose-500 bg-rose-50/60 p-5">
          <HardDriveUpload className="text-rose-700" />
          <h3 className="mt-4 text-lg font-semibold text-slate-950">Restore from backup</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">This replaces the live database after verification. A safety backup is created first and the app restarts.{status?.split_database ? " Select the matching reports and registrations backup pair." : ""}</p>
          <label className="mt-5 block text-sm font-medium text-slate-800">{status?.split_database ? "Reports SQLite backup" : "SQLite backup"}</label>
          <Input className="mt-2 bg-white" type="file" accept=".sqlite,.db,application/vnd.sqlite3" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          {status?.split_database && <><label className="mt-4 block text-sm font-medium text-slate-800">Registrations SQLite backup</label><Input className="mt-2 bg-white" type="file" accept=".sqlite,.db,application/vnd.sqlite3" onChange={(event) => setRegistrationFile(event.target.files?.[0] || null)} /></>}
          <label className="mt-4 block text-sm font-medium text-slate-800">Type <span className="font-bold">RESTORE DATABASE</span></label>
          <Input className="mt-2 bg-white" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          <Button className="mt-4" variant="destructive" disabled={busy || !file || (status?.split_database && !registrationFile) || confirmation !== "RESTORE DATABASE"}><HardDriveUpload />Verify and restore</Button>
        </form>
      </section>
    </div>
  );
}
