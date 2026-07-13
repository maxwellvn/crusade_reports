import * as React from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Download, Loader2, Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingRows } from "@/components/ui/skeleton";
import { getJSON, postJSON } from "@/lib/api";

// Generate/regenerate per-zone and per-network capability links and export
// them in bulk. Lives inside the KingsChat-authenticated AdminGate.

const linkFor = (token) => `${window.location.origin}/zone/${token}`;

export function ZoneLinks() {
  const [data, setData] = React.useState(null); // { zones: [{name, token}], networks: [...] }
  const [busy, setBusy] = React.useState(false);
  const [activeKind, setActiveKind] = React.useState("zone");
  const [query, setQuery] = React.useState("");
  const [linkStatus, setLinkStatus] = React.useState("all");

  React.useEffect(() => {
    getJSON("/zone-links").then(setData).catch((e) => toast.error(e.message));
  }, []);

  const listKey = (kind) => (kind === "network" ? "networks" : "zones");

  async function generate(kind, name, quiet) {
    const { token } = await postJSON("/zone-links", { name, kind });
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

  const missing = data ? data.zones.filter((z) => !z.token).length + data.networks.filter((n) => !n.token).length : 0;
  const tabs = data ? [["zone", "Zones", data.zones], ["network", "Networks", data.networks]] : [];
  const [, activeTitle, activeRows] = tabs.find(([kind]) => kind === activeKind) || [];
  const visibleRows = (activeRows || []).filter((row) => {
    const matchesName = row.name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = linkStatus === "all" || (linkStatus === "generated" ? row.token : !row.token);
    return matchesName && matchesStatus;
  });

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
          <Button type="button" size="sm" onClick={exportCsv} disabled={!data}><Download /> Export CSV</Button>
        </div>
      </div>

      {!data ? (
        <Card><CardContent className="pt-6"><LoadingRows rows={8} /></CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 border-b" role="tablist" aria-label="Dashboard link types">
            {tabs.map(([kind, title, rows]) => (
              <button key={kind} type="button" role="tab" aria-selected={activeKind === kind} onClick={() => setActiveKind(kind)}
                className={`border-b-2 px-4 py-3 text-sm font-medium ${activeKind === kind ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {title} <span className="font-normal">({rows.length})</span>
              </button>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{activeTitle} <span className="font-normal text-muted-foreground">({visibleRows.length} of {activeRows.length})</span></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9"
                    placeholder={`Search ${activeTitle.toLowerCase()}…`} aria-label={`Search ${activeTitle.toLowerCase()}`} />
                </div>
                <Select value={linkStatus} onChange={(event) => setLinkStatus(event.target.value)} aria-label="Filter by link status">
                  <option value="all">All links</option>
                  <option value="generated">Generated</option>
                  <option value="missing">Missing links</option>
                </Select>
              </div>
              {!visibleRows.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No matching {activeTitle.toLowerCase()} found.</p>
              ) : (
                <ul className="divide-y">
                  {visibleRows.map((r) => (
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
                          onClick={() => generate(activeKind, r.name).catch((e) => toast.error(e.message))}
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
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Regenerating a link invalidates the previous one immediately. Anyone with a link can view that organization’s data — share links only with its coordinators.
      </p>
    </div>
  );
}
