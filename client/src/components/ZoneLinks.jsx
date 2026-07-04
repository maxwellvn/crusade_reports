import * as React from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Download, KeyRound, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { LoadingRows } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

// Admin-only: generate/regenerate per-zone and per-network capability links and
// export them in bulk. Every zone and network is listed — a link can be created
// before any report or registration exists. Gated by ADMIN_KEY.

const KEY_LS = "crusades-admin-key";
const linkFor = (token) => `${window.location.origin}/zone/${token}`;

export function ZoneLinks() {
  const [adminKey, setAdminKey] = React.useState(() => localStorage.getItem(KEY_LS) || "");
  const [authed, setAuthed] = React.useState(false);
  const [data, setData] = React.useState(null); // { zones: [{name, token}], networks: [...] }
  const [busy, setBusy] = React.useState(false);

  const hdrs = (k = adminKey) => ({ "Content-Type": "application/json", "x-admin-key": k });

  const load = React.useCallback(async (k = adminKey) => {
    setData(await api("/zone-links", { headers: hdrs(k) }));
    setAuthed(true);
  }, [adminKey]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (adminKey) load().catch(() => { setAuthed(false); localStorage.removeItem(KEY_LS); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function unlock(e) {
    e.preventDefault();
    const k = e.target.key.value.trim();
    try {
      await load(k);
      setAdminKey(k);
      localStorage.setItem(KEY_LS, k);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const listKey = (kind) => (kind === "network" ? "networks" : "zones");

  async function generate(kind, name, quiet) {
    const { token } = await api("/zone-links", { method: "POST", headers: hdrs(), body: JSON.stringify({ name, kind }) });
    setData((d) => ({ ...d, [listKey(kind)]: d[listKey(kind)].map((r) => (r.name === name ? { ...r, token } : r)) }));
    if (!quiet) toast.success(`Link ready for ${name}`);
  }

  async function generateAllMissing() {
    setBusy(true);
    try {
      for (const kind of ["zone", "network"])
        for (const r of data[listKey(kind)].filter((x) => !x.token)) await generate(kind, r.name, true);
      toast.success("Every zone and network has a link");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  function copy(token) {
    navigator.clipboard.writeText(linkFor(token)).then(() => toast.success("Link copied"));
  }

  function exportCsv() {
    const rows = [
      ...data.zones.map((z) => ["Zone", z.name, z.token]),
      ...data.networks.map((n) => ["Network", n.name, n.token]),
    ].filter(([, , token]) => token);
    if (!rows.length) return toast.error("No links generated yet");
    const csv = ["Type,Name,Link", ...rows.map(([kind, name, token]) => `${kind},"${name.replaceAll('"', '""')}",${linkFor(token)}`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "dashboard-links.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!authed)
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> Admin access</CardTitle>
            <CardDescription>Enter the admin key to manage dashboard links.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={unlock} className="space-y-4">
              <Field label="Admin key">
                <Input name="key" type="password" placeholder="Paste the admin key" autoFocus />
              </Field>
              <Button type="submit" className="w-full">Unlock</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );

  const missing = data ? data.zones.filter((z) => !z.token).length + data.networks.filter((n) => !n.token).length : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Dashboard links</h2>
          <p className="text-sm text-muted-foreground">Each link opens that organization’s private dashboard — its registrations and reports, nothing else.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={generateAllMissing} disabled={busy || !missing}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Generate all missing{missing ? ` (${missing})` : ""}
          </Button>
          <Button type="button" size="sm" onClick={exportCsv}><Download /> Export CSV</Button>
        </div>
      </div>

      {!data ? (
        <Card><CardContent className="pt-6"><LoadingRows rows={8} /></CardContent></Card>
      ) : (
        [["zone", "Zones", data.zones], ["network", "Networks", data.networks]].map(([kind, title, rows]) => (
          <Card key={kind}>
            <CardHeader>
              <CardTitle className="text-sm">{title} <span className="font-normal text-muted-foreground">({rows.length})</span></CardTitle>
            </CardHeader>
            <CardContent>
              {!rows.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No {title.toLowerCase()} found.</p>
              ) : (
                <ul className="divide-y">
                  {rows.map((r) => (
                    <li key={r.name} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{r.name}</p>
                        {r.token
                          ? <p className="truncate text-xs text-muted-foreground">{linkFor(r.token)}</p>
                          : <p className="text-xs text-muted-foreground">No link yet</p>}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        {r.token && (
                          <Button type="button" variant="outline" size="sm" onClick={() => copy(r.token)}><Copy /> Copy</Button>
                        )}
                        <Button type="button" variant={r.token ? "ghost" : "outline"} size="sm"
                          onClick={() => generate(kind, r.name).catch((e) => toast.error(e.message))}
                          title={r.token ? "Regenerating invalidates the old link" : undefined}>
                          <RefreshCw /> {r.token ? "Regenerate" : "Generate"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))
      )}
      <p className="text-xs text-muted-foreground">
        Regenerating a link invalidates the previous one immediately. Anyone with a link can view that organization’s data — share links only with its coordinators.
      </p>
    </div>
  );
}
