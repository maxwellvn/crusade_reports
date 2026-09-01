import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Search, Upload, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { LoadingRows } from "@/components/ui/skeleton";
import { Combobox } from "@/components/Combobox";
import { CollaboratorPicker, ContributionChecklist, splitCollaboration } from "@/components/CollaborationFields";
import { getJSON, postForm, postJSON, putJSON, REPORT_UPLOAD_TIMEOUT_MS } from "@/lib/api";
import { useOrgData } from "@/lib/orgForm";
import { citySelectionFields } from "@/lib/citySelection";
import { nfull, orgHierarchy, typeLabel, StatSlab } from "@/lib/dashboardWidgets";
import { Pagination } from "@/lib/tableTools";
import { CORE_OUTCOMES, CRUSADE_TYPES, EXTENDED_OUTCOMES, FORMATS, METRIC_KEYS, ONLINE_TYPES, PERMIT_OPTIONS } from "@/lib/constants";
import { ReportMediaFields, buildReportFormData, formatBytes, MAX_REPORT_PHOTOS_BYTES, photosOverLimitMessage, totalPhotoBytes } from "@/components/ReportMediaFields";
import { UploadProgress } from "@/components/UploadProgress";
import { uploadForm } from "@/lib/upload";
import { TemplateDownloadButton } from "@/components/TemplateDownloadButton";

// UTC "today" (YYYY-MM-DD), matching the server's date('now') for the collaboration
// edit lock. Purely a display cue — the server is the authority on the cutoff.
const todayISO = () => new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 50;
const PORTAL_REPORT_DRAFT_VERSION = 1;
const PORTAL_REPORT_DRAFT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const SOURCE_LABELS = { network: "Network directly", zone: "Zones", group: "Groups", church: "Churches", cell: "Cells", other: "Other ministries" };
const sourceLabel = (source, networkName) => source === "network" ? `${networkName} directly` : (SOURCE_LABELS[source] || "Other ministries");

// Scope drafts without placing the private portal capability token in storage.
function portalReportDraftKey(token, crusadeId) {
  let hash = 2166136261;
  for (const char of String(token || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `zone-report-draft-v${PORTAL_REPORT_DRAFT_VERSION}:${crusadeId}:${(hash >>> 0).toString(36)}`;
}

function readPortalReportDraft(key) {
  if (!key) return null;
  try {
    const draft = JSON.parse(localStorage.getItem(key));
    if (!draft || draft.version !== PORTAL_REPORT_DRAFT_VERSION || typeof draft.report !== "object") return null;
    if (Date.now() - Number(draft.savedAt || 0) > PORTAL_REPORT_DRAFT_MAX_AGE) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    return null;
  }
}

// Zone dashboard, opened via a capability link (/zone/<token>). The server
// scopes every read and readiness update to the token's zone/network.

export function ZonePortal() {
  const { token } = useParams();
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [openCrusade, setOpenCrusade] = React.useState(null);
  const [reportingCrusade, setReportingCrusade] = React.useState(null);
  const [viewingCrusade, setViewingCrusade] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState("registrations");
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("");
  const [readinessFilter, setReadinessFilter] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [page, setPage] = React.useState(1);

  // Filters and pagination are applied server-side so the dashboard stays fast
  // even with thousands of crusades. A short debounce keeps the search box
  // from firing a request per keystroke.
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const loadPortal = React.useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (typeFilter) params.set("event_type", typeFilter);
    if (readinessFilter) params.set("readiness_status", readinessFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    params.set("view", activeTab);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    getJSON(`/zone-portal/${token}?${params.toString()}`)
      .then((result) => { setData(result); setError(null); })
      .catch((requestError) => {
        setError(requestError);
        toast.error(requestError.message || "Could not refresh the dashboard.");
      });
  }, [token, debouncedQuery, typeFilter, readinessFilter, sourceFilter, activeTab, page]);
  React.useEffect(() => { loadPortal(); }, [loadPortal]);

  const changeFilter = (setter) => (value) => { setter(value); setPage(1); };

  if (error && !data) {
    const invalidLink = error.status === 404;
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="max-w-md space-y-4 text-center">
          <img src="/logo.png" alt="" className="mx-auto h-10 w-auto" />
          <h1 className="text-2xl tracking-tight">{invalidLink ? "This link isn’t valid." : "Dashboard temporarily unavailable"}</h1>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          {!invalidLink && <Button type="button" onClick={loadPortal}>Try again</Button>}
        </div>
      </div>
    );
  }

  const editingCrusade = data?.items.find((item) => item.id === openCrusade) || null;
  const filteredItems = data?.items || [];
  const filteredUnregistered = data?.crusades || [];
  const itemsTotalPages = data ? Math.max(Math.ceil(data.items_total / PAGE_SIZE), 1) : 1;
  const crusadesTotalPages = data ? Math.max(Math.ceil(data.crusades_total / PAGE_SIZE), 1) : 1;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4">
          <img src="/logo.png" alt="" className="h-11 w-auto shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight">{data ? data.zone : "Zone dashboard"}</h1>
            <p className="hidden truncate text-sm text-muted-foreground sm:block">Your {data?.kind === "network" ? "network" : "zone"}’s crusade registrations and reports.</p>
          </div>
          {data && <div className="flex shrink-0 gap-2 max-sm:w-full max-sm:flex-wrap">
            <Button asChild variant="outline" size="sm"><Link to={`/crusade-registration/register?portal=${encodeURIComponent(token)}`}>Register crusades</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to={`/crusade-registration/bulk-upload?portal=${encodeURIComponent(token)}`}>Bulk register</Link></Button>
          </div>}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        {!data ? (
          <Card><CardContent className="pt-6"><LoadingRows rows={8} /></CardContent></Card>
        ) : (
          <>
            <StatSlab stats={[
              ["Crusades planned", data.totals.planned],
              ["Crusades held", data.totals.held],
              ["Total attendance", data.totals.attendance],
              ["Souls won", data.totals.salvation],
            ]} />

            {data.kind === "network" && <Card><CardHeader><CardTitle className="text-sm">Registration source breakdown</CardTitle><CardDescription>{data.inherited_visibility_enabled
              ? `This dashboard includes ${data.zone} registrations and crusades submitted by other organisations under its related crusade type.`
              : `This dashboard shows only crusades registered directly under ${data.zone}.`}</CardDescription></CardHeader><CardContent><div className="grid border-y sm:grid-cols-2 lg:grid-cols-3">{data.source_breakdown.map((entry) => <div key={entry.source} className="border-b p-4 last:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0"><p className="text-xs font-medium text-muted-foreground">{sourceLabel(entry.source, data.zone)}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{nfull.format(entry.planned)}</p><p className="mt-1 text-xs text-muted-foreground">planned crusades</p></div>)}</div></CardContent></Card>}

            <Card>
              <CardContent className={`grid gap-2 pt-6 ${data.kind === "network" ? "sm:grid-cols-2 lg:grid-cols-[1fr_12rem_12rem_13rem]" : "sm:grid-cols-[1fr_13rem_13rem]"}`}>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9"
                    placeholder="Search crusades by name, city, venue or date…" aria-label="Search crusades" />
                </div>
                <Select value={typeFilter} onChange={(event) => changeFilter(setTypeFilter)(event.target.value)} aria-label="Filter by crusade type">
                  <option value="">All crusade types</option>
                  {CRUSADE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
                <Select value={readinessFilter} onChange={(event) => changeFilter(setReadinessFilter)(event.target.value)} aria-label="Filter by readiness">
                  <option value="">All readiness statuses</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending confirmation</option>
                  <option value="preparing">Preparing</option>
                  <option value="ready">Ready</option>
                  <option value="holding">Holding as planned</option>
                  <option value="not_holding">Not holding</option>
                </Select>
                {data.kind === "network" && <Select value={sourceFilter} onChange={(event) => changeFilter(setSourceFilter)(event.target.value)} aria-label="Filter by registration source"><option value="">All registration sources</option><option value="network">Registered directly by {data.zone}</option><option value="church">Registered by churches</option><option value="zone">Registered by zones</option><option value="group">Registered by groups</option><option value="cell">Registered by cells</option><option value="other">Other ministry registrations</option></Select>}
              </CardContent>
            </Card>

            <div className="flex border-b" role="tablist" aria-label="Crusade records">
              {[['registrations', 'Registrations'], ...(data.reporting_open ? [['reports', 'Reports']] : [])].map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={activeTab === value}
                  onClick={() => { setActiveTab(value); setPage(1); }}
                  className={`border-b-2 px-4 py-2 text-sm font-medium ${activeTab === value ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "registrations" && <Card>
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-sm">Registered crusades</CardTitle>
                  <CardDescription>Open a particular crusade to update its readiness and confirmation.</CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/zone-portal/${encodeURIComponent(token)}/export/registrations?format=csv`}>
                    <Download className="size-4" /> Export CSV
                  </a>
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {!filteredItems.length ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No registered crusades match your search and filters.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Date</th>
                        <th className="py-2 pr-3 font-medium">Crusade</th>
                        <th className="py-2 pr-3 font-medium">Type</th>
                        <th className="py-2 pr-3 font-medium">Country</th>
                        <th className="py-2 pr-3 font-medium">Location</th>
                        <th className="py-2 pr-3 font-medium">Registration type</th>
                        {data.kind === "network" && <th className="py-2 pr-3 font-medium">Source</th>}
                        <th className="py-2 pr-3 text-right font-medium">Expected</th>
                        <th className="py-2 font-medium">Readiness</th>
                        <th className="py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {filteredItems.map((item) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="py-2 pr-3 whitespace-nowrap">{item.event_date || "—"}</td>
                            <td className="max-w-56 py-2 pr-3">
                              <span className="font-medium">{item.event_name || `${typeLabel(item.event_type)} registration`}</span>
                              {item.planned_count > 1 && <div className="text-xs text-muted-foreground">Legacy aggregate: {nfull.format(item.planned_count)} crusades</div>}
                            </td>
                            <td className="py-2 pr-3">{typeLabel(item.event_type)}</td>
                            <td className="max-w-40 py-2 pr-3">{item.country || "—"}</td>
                            <td className="max-w-56 py-2 pr-3 text-muted-foreground">{[item.city, item.venue].filter(Boolean).join(" · ") || "Details pending"}</td>
                            <td className="min-w-64 max-w-80 py-2 pr-3 text-xs">{orgHierarchy(item)}</td>
                            {data.kind === "network" && <td className="py-2 pr-3"><SourceBadge source={item.source_scope} networkName={data.zone} /></td>}
                            <td className="py-2 pr-3 text-right">{nfull.format(item.expected_attendance || 0)}</td>
                            <td className="py-2">
                              <StatusBadge status={item.readiness_status} />
                            </td>
                            <td className="py-2 text-right">
                              {item.visitor ? (
                                <Button type="button" variant="outline" size="sm" onClick={() => setViewingCrusade(item)}>
                                  View
                                </Button>
                              ) : (
                                <Button type="button" variant="outline" size="sm" onClick={() => setOpenCrusade(item.id)}>
                                  Edit
                                </Button>
                              )}
                            </td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {data.items_total > PAGE_SIZE && <div className="border-t pt-4"><Pagination page={page} totalPages={itemsTotalPages} onPage={setPage} /></div>}
              </CardContent>
            </Card>}

            {!data.reporting_open && <Card><CardContent className="pt-6 text-sm text-muted-foreground">
              Reporting has not opened yet. The Reports tab will appear here when the super admin opens reporting.
            </CardContent></Card>}

            {data.reporting_open && activeTab === "reports" && <Card>
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-sm">Crusade reports</CardTitle>
                  <CardDescription>Submit outcomes for each registered crusade individually.</CardDescription>
                </div>
                <Button asChild variant="outline" size="sm"><a href={`/api/zone-portal/${encodeURIComponent(token)}/export/reports?format=csv`}><Download className="size-4" /> Export CSV</a></Button>
              </CardHeader>
              <CardContent className="space-y-4 overflow-x-auto">
                <ReportTemplateWorkflow token={token} pendingCount={data.pendingCount || 0} onImported={loadPortal} />
                {!filteredItems.length ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No registered crusades match your search and filters.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Submitted</th>
                        <th className="py-2 pr-3 font-medium">Date held</th>
                        <th className="py-2 pr-3 font-medium">Crusade</th>
                        <th className="py-2 pr-3 font-medium">Type</th>
                        <th className="py-2 pr-3 font-medium">Country</th>
                        <th className="py-2 pr-3 font-medium">Location</th>
                        <th className="py-2 pr-3 font-medium">Registration type</th>
                        {data.kind === "network" && <th className="py-2 pr-3 font-medium">Source</th>}
                        <th className="py-2 pr-3 font-medium">Report status</th>
                        <th className="py-2 pr-3 text-right font-medium">Attendance</th>
                        <th className="py-2 pr-3 text-right font-medium">Souls won</th>
                        <th className="py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {filteredItems.map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap">{item.reported_at || "Not submitted"}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{item.event_date || "—"}</td>
                          <td className="max-w-52 py-2 pr-3 font-medium">{item.event_name || typeLabel(item.event_type)}</td>
                          <td className="py-2 pr-3">{typeLabel(item.event_type)}</td>
                          <td className="max-w-40 py-2 pr-3">{item.country || "—"}</td>
                          <td className="max-w-56 py-2 pr-3 text-muted-foreground">{[item.city, item.venue].filter(Boolean).join(" · ") || "—"}</td>
                          <td className="min-w-64 max-w-80 py-2 pr-3 text-xs">{orgHierarchy(item)}</td>
                          {data.kind === "network" && <td className="py-2 pr-3"><SourceBadge source={item.source_scope} networkName={data.zone} /></td>}
                          <td className="py-2 pr-3"><ReportStatusBadge reported={!!item.report_id} /></td>
                          <td className="py-2 pr-3 text-right">{item.report_id ? nfull.format((item.reported_attendance || 0) + (item.reported_online_participation || 0)) : "—"}</td>
                          <td className="py-2 pr-3 text-right">{item.report_id ? nfull.format(item.reported_salvation || 0) : "—"}</td>
                          <td className="py-2 text-right">
                            {item.visitor ? (
                              <Button type="button" variant="outline" size="sm" onClick={() => setViewingCrusade(item)}>
                                View
                              </Button>
                            ) : (
                              <Button type="button" size="sm" disabled={!!item.report_id} onClick={() => setReportingCrusade(item)}>
                                {item.report_id ? "Submitted" : "Submit report"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {data.items_total > PAGE_SIZE && <div className="border-t pt-4"><Pagination page={page} totalPages={itemsTotalPages} onPage={setPage} /></div>}
                {filteredUnregistered.length > 0 && <div className="space-y-3 border-t pt-5">
                  <div>
                    <p className="text-sm font-medium">Reports without prior registration</p>
                    <p className="text-xs text-muted-foreground">Crusades reported through the “didn’t register” form.</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Submitted</th><th className="py-2 pr-3 font-medium">Date held</th><th className="py-2 pr-3 font-medium">Crusade</th>
                      <th className="py-2 pr-3 font-medium">Country</th><th className="py-2 pr-3 font-medium">Location</th>
                      <th className="py-2 pr-3 font-medium">Reporting type</th>
                      <th className="py-2 pr-3 text-right font-medium">Attendance</th><th className="py-2 text-right font-medium">Souls won</th>
                    </tr></thead>
                    <tbody className="tabular-nums">
                      {filteredUnregistered.map((crusade) => <tr key={crusade.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap">{crusade.reported_at || "—"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{crusade.event_date}</td>
                        <td className="py-2 pr-3 font-medium">{crusade.event_name || typeLabel(crusade.event_type)}</td>
                        <td className="py-2 pr-3">{crusade.country}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{[crusade.city, crusade.venue].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="min-w-64 max-w-80 py-2 pr-3 text-xs">{orgHierarchy(crusade)}</td>
                        <td className="py-2 pr-3 text-right">{nfull.format((crusade.attendance || 0) + (crusade.online_participation || 0))}</td>
                        <td className="py-2 text-right">{nfull.format(crusade.salvation || 0)}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>}
                {data.crusades_total > PAGE_SIZE && <div className="pt-4"><Pagination page={page} totalPages={crusadesTotalPages} onPage={setPage} /></div>}
              </CardContent>
            </Card>}
            {viewingCrusade && (
              <VisitorCrusadeDialog crusade={viewingCrusade} onClose={() => setViewingCrusade(null)} />
            )}
            {editingCrusade && (
              <ZoneCrusadeEditDialog crusade={editingCrusade} token={token} onClose={() => setOpenCrusade(null)} onSaved={(updated) => {
                setData((current) => ({ ...current, items: current.items.map((item) => item.id === editingCrusade.id ? { ...item, ...updated } : item) }));
              }} />
            )}
            {reportingCrusade && (
              <CrusadeReportDialog crusade={reportingCrusade} token={token} onClose={() => setReportingCrusade(null)}
                onAlreadySubmitted={() => {
                  setReportingCrusade(null);
                  setPage(1);
                  loadPortal();
                }}
                onSubmitted={(report) => {
                  setData((current) => ({
                    ...current,
                    totals: {
                      ...current.totals,
                      held: current.totals.held + 1,
                      attendance: current.totals.attendance + (report.reported_attendance || 0) + (report.reported_online_participation || 0),
                      salvation: current.totals.salvation + (report.reported_salvation || 0),
                    },
                    items: current.items
                      .map((item) => item.id === reportingCrusade.id ? { ...item, ...report } : item)
                      .sort((a, b) => Boolean(b.report_id) - Boolean(a.report_id) || String(b.reported_at || "").localeCompare(String(a.reported_at || ""))),
                  }));
                  setPage(1);
                  setReportingCrusade(null);
                }} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// Read-only details for a crusade owned by another org but shown on a network
// dashboard because its type matches the network. No edit or report actions.
function VisitorCrusadeDialog({ crusade, onClose }) {
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current?.showModal(); }, []);
  const row = (label, value) => (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
  return (
    <dialog ref={ref} onClose={onClose} onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      className="max-h-[calc(100vh-2rem)] w-[min(40rem,calc(100%-2rem))] overflow-y-auto border bg-background p-0 text-foreground backdrop:bg-black/60">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Crusade details — view only</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{crusade.event_name || typeLabel(crusade.event_type)}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => ref.current?.close()} aria-label="Close details"><X /></Button>
      </div>
      <div className="space-y-5 p-5 text-sm">
        <div>
          {row("Type", typeLabel(crusade.event_type))}
          {row("Date", crusade.event_date)}
          {row("Country", crusade.country)}
          {row("City", crusade.city)}
          {row("Venue / address", crusade.venue)}
          {row("Minister(s)", crusade.minister_name)}
          {row("Expected attendance", crusade.expected_attendance ? nfull.format(crusade.expected_attendance) : "")}
          {row("Readiness", STATUS_OPTIONS.find(([value]) => value === crusade.readiness_status)?.[1])}
          {crusade.readiness_notes && row("Readiness notes", crusade.readiness_notes)}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Organizers</p>
          <div className="text-xs">{orgHierarchy(crusade)}</div>
          {row("Contact name", crusade.contact_name)}
          {row("Email", crusade.contact_email)}
          {row("Phone", [crusade.phone_country_code, crusade.phone_number].filter(Boolean).join(" "))}
          {row("KingsChat", crusade.kingschat_username)}
        </div>
        {crusade.report_id && <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Reported outcomes</p>
          {row("Attendance", nfull.format((crusade.reported_attendance || 0) + (crusade.reported_online_participation || 0)))}
          {row("Crusade expense", crusade.reported_expense ? nfull.format(crusade.reported_expense) : "0")}
          {row("Souls won", nfull.format(crusade.reported_salvation || 0))}
        </div>}
        <p className="text-xs text-muted-foreground">This crusade is managed and reported by the organization that registered it.</p>
      </div>
    </dialog>
  );
}

function ZoneCrusadeEditDialog({ crusade, token, onClose, onSaved }) {
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      className="w-[min(60rem,calc(100%-2rem))] border bg-background p-0 text-foreground backdrop:bg-black/60">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Edit registered crusade</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{crusade.event_name || typeLabel(crusade.event_type)}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => ref.current?.close()} aria-label="Close editor"><X /></Button>
      </div>
      <div className="p-5">
        <CrusadeEditor crusade={crusade} savePath={`/zone-portal/${token}/crusades/${crusade.id}/readiness`} onSaved={(updated) => {
          onSaved(updated);
          ref.current?.close();
        }} />
      </div>
    </dialog>
  );
}

function SourceBadge({ source, networkName }) {
  const direct = source === "network";
  return <span className={`inline-flex whitespace-nowrap border px-2 py-1 text-xs font-medium ${direct ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-300 bg-slate-50 text-foreground"}`}>{sourceLabel(source, networkName)}</span>;
}

function ReportStatusBadge({ reported }) {
  return <span className={`inline-flex border px-2 py-1 text-xs font-medium ${reported
    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
    : "border-amber-300 bg-amber-50 text-amber-700"}`}>
    {reported ? "Submitted" : "Not submitted"}
  </span>;
}

function ReportTemplateWorkflow({ token, pendingCount, onImported }) {
  const inputRef = React.useRef(null);
  const [file, setFile] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);

  async function upload(selectedFile, commit = false) {
    if (!selectedFile) return;
    setBusy(true);
    setProgress({ phase: "uploading", percent: 0, bytesPerSecond: 0 });
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const result = await uploadForm(`/zone-portal/${encodeURIComponent(token)}/report-template${commit ? "?commit=1" : ""}`, form, { onProgress: setProgress });
      if (commit || result.committed) {
        const skipped = result.skipped_already_submitted || 0;
        toast.success(`${result.submitted} new ${result.submitted === 1 ? "report" : "reports"} submitted${skipped ? `; ${skipped} already submitted ${skipped === 1 ? "row was" : "rows were"} safely skipped` : ""}.`);
        setFile(null);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
        await onImported();
      } else {
        setFile(selectedFile);
        setPreview(result);
      }
    } catch (error) {
      setProgress({ phase: "error", message: error.message });
      toast.error(error.message || "Could not process the Excel report template.");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(null), 1200);
    }
  }

  return <section className="border-y border-emerald-200 bg-emerald-50/50 p-4" aria-labelledby="excel-reporting-heading">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-xl">
        <h3 id="excel-reporting-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-950"><FileSpreadsheet className="size-4 text-emerald-700" /> Submit reports with Excel</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">Download your unreported registrations, complete the green report columns, add photo or video evidence as links, then upload the same .xlsx file.</p>
        <p className="mt-1 text-xs font-medium text-emerald-800">{nfull.format(pendingCount)} registered {pendingCount === 1 ? "crusade needs" : "crusades need"} a report.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <TemplateDownloadButton url={`/zone-portal/${encodeURIComponent(token)}/report-template`} filename="report-template.xlsx" size="sm" disabled={pendingCount < 1}>Download Excel template</TemplateDownloadButton>
        <Button type="button" size="sm" onClick={() => inputRef.current?.click()} disabled={busy || pendingCount < 1}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload completed template</Button>
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => upload(event.target.files?.[0] || null)} />
      </div>
    </div>
    <div className="mt-4"><UploadProgress progress={progress} /></div>
    {preview && <div className={`mt-4 border p-3 text-sm ${preview.ok ? "border-emerald-300 bg-white" : "border-red-300 bg-red-50"}`}>
      {preview.ok ? <>
        <p className="flex items-center gap-2 font-semibold text-emerald-800"><CheckCircle2 className="size-4" /> Ready to submit {preview.summary.reports} {preview.summary.reports === 1 ? "report" : "reports"}</p>
        <p className="mt-1 text-xs text-slate-600">{nfull.format(preview.summary.attendance)} total attendance · {nfull.format(preview.summary.salvations)} salvations</p>
        {!!preview.summary.already_submitted && <p className="mt-1 text-xs text-amber-700">{nfull.format(preview.summary.already_submitted)} already-submitted {preview.summary.already_submitted === 1 ? "row will" : "rows will"} be safely skipped.</p>}
        <div className="mt-3 max-h-40 overflow-y-auto border-y border-slate-200">{preview.rows.map((row) => <div key={row.registration_item_id} className="flex flex-wrap justify-between gap-2 border-b px-2 py-2 text-xs last:border-0"><span className="font-medium">{row.event_name}</span><span className="text-slate-500">{row.event_date} · {nfull.format(row.attendance)} attendance</span></div>)}</div>
        <div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" disabled={busy} onClick={() => upload(file, true)}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Confirm and submit</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setFile(null); setPreview(null); if (inputRef.current) inputRef.current.value = ""; }}>Cancel</Button></div>
      </> : <>
        <p className="flex items-center gap-2 font-semibold text-red-800"><AlertTriangle className="size-4" /> Correct these issues and upload the file again</p>
        <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-red-800">{preview.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
      </>}
    </div>}
  </section>;
}

function useCityFetcher(countryName) {
  const [countryCode, setCountryCode] = React.useState("");
  React.useEffect(() => {
    getJSON("/countries")
      .then((countries) => setCountryCode(countries.find((country) => country.name === countryName)?.code || ""))
      .catch(() => setCountryCode(""));
  }, [countryName]);
  return React.useCallback(async (query) => {
    const cities = await getJSON(`/places/autocomplete?input=${encodeURIComponent(query)}${countryCode ? `&country=${countryCode}` : ""}`);
    return cities.map((city) => ({ value: city.place_id, label: city.main, sublabel: city.secondary }));
  }, [countryCode]);
}

export function CrusadeReportDialog({ crusade, token, savePath, submissionContext, onClose, onSubmitted, onAlreadySubmitted }) {
  const ref = React.useRef(null);
  const draftKey = token ? portalReportDraftKey(token, crusade.id) : "";
  const draft = React.useMemo(() => readPortalReportDraft(draftKey), [draftKey]);
  const draftCleared = React.useRef(false);
  const [saving, setSaving] = React.useState(false);
  const [visualViewport, setVisualViewport] = React.useState(null);
  const defaultReport = {
    format: ONLINE_TYPES.includes(crusade.event_type) ? "online" : "physical",
    event_type: crusade.event_type || "", other_event_type: "", event_name: crusade.event_name || "",
    country: crusade.country || "", city: crusade.city || "", city_place_id: crusade.city_place_id || "", event_date: crusade.event_date || "",
    attendance: 0, crusade_expense: 0, minister_name: crusade.minister_name || "", venue: crusade.venue || "",
    ...Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])),
  };
  const [report, setReport] = React.useState(() => ({ ...defaultReport, ...(draft?.report || {}) }));
  const [highlights, setHighlights] = React.useState(() => String(draft?.highlights || ""));
  const [photoLinks, setPhotoLinks] = React.useState(() => String(draft?.photoLinks || ""));
  const [videoLinks, setVideoLinks] = React.useState(() => String(draft?.videoLinks || ""));
  const [photos, setPhotos] = React.useState([]);
  const photoTotal = totalPhotoBytes(photos);
  const fetchCities = useCityFetcher(crusade.country);

  React.useEffect(() => { ref.current?.showModal(); }, []);
  React.useEffect(() => {
    if (!draftKey) return undefined;
    const timer = window.setTimeout(() => {
      if (draftCleared.current) return;
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          version: PORTAL_REPORT_DRAFT_VERSION,
          report,
          highlights,
          photoLinks,
          videoLinks,
          savedAt: Date.now(),
        }));
      } catch { /* storage unavailable or full */ }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftKey, report, highlights, photoLinks, videoLinks]);
  React.useEffect(() => {
    const viewport = window.visualViewport;

    const updateViewport = () => {
      setVisualViewport({
        height: Math.round(viewport?.height || window.innerHeight),
        offsetTop: Math.round(viewport?.offsetTop || 0),
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
    };
  }, []);
  const setField = (field, value) => setReport((current) => ({ ...current, [field]: value }));

  const dialogViewportStyle = visualViewport ? {
    top: `${visualViewport.offsetTop + 8}px`,
    bottom: "auto",
    marginTop: 0,
    marginBottom: 0,
    maxHeight: `${Math.max(160, visualViewport.height - 16)}px`,
  } : undefined;

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const required = [report.format, report.event_type, report.event_name, report.city, report.event_date, report.minister_name, report.venue];
    if (required.some((value) => !String(value || "").trim()) || (report.event_type === "other" && !report.other_event_type.trim())) {
      return toast.error("Please complete all required report details.");
    }
    if (photoTotal > MAX_REPORT_PHOTOS_BYTES) {
      return toast.error(photosOverLimitMessage(photoTotal));
    }
    setSaving(true);
    try {
      const numericReport = { ...report, attendance: Number(report.attendance) || 0, crusade_expense: Number(report.crusade_expense) || 0 };
      METRIC_KEYS.forEach((key) => { numericReport[key] = Number(report[key]) || 0; });
      const path = savePath || `/zone-portal/${token}/crusades/${crusade.id}/report`;
      const payload = { ...submissionContext, crusade: numericReport, highlights, photo_links: photoLinks, video_links: videoLinks };
      const submitted = photos.length
        ? await postForm(path, buildReportFormData(payload, photos), { timeoutMs: REPORT_UPLOAD_TIMEOUT_MS })
        : await postJSON(path, payload);
      draftCleared.current = true;
      if (draftKey) {
        try { localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
      }
      toast.success("Crusade report submitted.");
      onSubmitted(submitted);
    } catch (error) {
      if (error.code === "ALREADY_REPORTED") {
        draftCleared.current = true;
        if (draftKey) {
          try { localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
        }
        toast.success("This report was already submitted successfully.");
        onAlreadySubmitted?.();
        return;
      }
      toast.error(error.message || "Could not submit the crusade report. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      style={dialogViewportStyle}
      className="w-[calc(100%-1rem)] overflow-hidden border bg-background p-0 text-foreground backdrop:bg-black/60 sm:w-[min(60rem,calc(100%-2rem))]">
      <form onSubmit={submit} style={visualViewport ? { maxHeight: dialogViewportStyle.maxHeight } : undefined}
        className="flex max-h-[calc(100vh-1rem)] flex-col supports-[height:100dvh]:max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100vh-2rem)] sm:supports-[height:100dvh]:max-h-[calc(100dvh-2rem)]">
        <div className="z-10 flex shrink-0 items-start justify-between gap-4 border-b bg-background p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Submit crusade report</p>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">{crusade.event_name || typeLabel(crusade.event_type)}</h2>
            {draft && <p className="mt-1 text-xs text-blue-700">Saved text restored. Please reselect any photos.</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => ref.current?.close()} aria-label="Close report form"><X /></Button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Crusade type" required>
            <Select value={report.event_type} onChange={(event) => setField("event_type", event.target.value)}>
              {CRUSADE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Format" required>
            <Select value={report.format} onChange={(event) => {
              setField("format", event.target.value);
              if (event.target.value === "online") setField("attendance", 0);
            }}>
              {FORMATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          {report.event_type === "other" && (
            <Field label="Specify type" required>
              <Input value={report.other_event_type} onChange={(event) => setField("other_event_type", event.target.value)} />
            </Field>
          )}
          <Field label="Crusade name" required>
            <Input value={report.event_name} onChange={(event) => setField("event_name", event.target.value)} />
          </Field>
          <Field label="Date held" required>
            <Input type="date" value={report.event_date} onChange={(event) => setField("event_date", event.target.value)} />
          </Field>
          <Field label="Country">
            <Input value={crusade.country || "—"} readOnly aria-readonly="true" className="cursor-not-allowed text-muted-foreground" />
          </Field>
          <Field label="City" required>
            <Combobox value={report.city} fetcher={fetchCities} minChars={2} allowCreate ariaLabel="City" placeholder="Search city" searchPlaceholder="Search city…"
              emptyText="No cities found" onSelect={(option) => setReport((current) => ({ ...current, ...citySelectionFields(option) }))} />
          </Field>
          <Field label="Venue / address" required className="lg:col-span-2">
            <Input value={report.venue} onChange={(event) => setField("venue", event.target.value)} />
          </Field>
          <Field label="Minister" required>
            <Input value={report.minister_name} onChange={(event) => setField("minister_name", event.target.value)} />
          </Field>
          {report.format !== "online" && (
            <Field label="Onsite attendance" required>
              <Input type="number" min="0" value={report.attendance} onChange={(event) => setField("attendance", event.target.value)} />
            </Field>
          )}
          <Field label="Online attendance">
            <Input type="number" min="0" value={report.online_participation} onChange={(event) => setField("online_participation", event.target.value)} />
          </Field>
          {report.event_type === "mega" && (
            <Field label="Crusade expense" hint="Enter the total amount spent on this mega crusade">
              <Input type="number" min="0" step="0.01" value={report.crusade_expense} onChange={(event) => setField("crusade_expense", event.target.value)} />
            </Field>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Outcomes <span className="font-normal text-muted-foreground">(enter 0 if none)</span></p>
          <div className="grid gap-3 sm:grid-cols-3">
            {CORE_OUTCOMES.map(([key, label]) => (
              <Field key={key} label={label}>
                <Input type="number" min="0" value={report[key]} onChange={(event) => setField(key, event.target.value)} />
              </Field>
            ))}
          </div>
        </div>

        <details open className="border p-4">
          <summary className="cursor-pointer text-sm font-medium">More outcomes — reach and materials distributed</summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {EXTENDED_OUTCOMES.map(([key, label]) => (
              <Field key={key} label={label}>
                <Input type="number" min="0" value={report[key]} onChange={(event) => setField(key, event.target.value)} />
              </Field>
            ))}
          </div>
        </details>

        <Field label="Highlights (optional)">
          <Textarea rows={4} maxLength={2000} value={highlights} onChange={(event) => setHighlights(event.target.value)} placeholder="Notable testimonies or moments…" />
        </Field>
        <ReportMediaFields
          photos={photos}
          onPhotosChange={setPhotos}
          photoLinks={photoLinks}
          onPhotoLinksChange={setPhotoLinks}
          videoLinks={videoLinks}
          onVideoLinksChange={setVideoLinks}
        />
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end sm:px-5">
          <Button type="button" variant="outline" onClick={() => ref.current?.close()}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? (photoTotal ? `Uploading ${formatBytes(photoTotal)}…` : "Submitting…") : "Submit report"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

const STATUS_OPTIONS = [
  ["confirmed", "Confirmed"],
  ["pending", "Pending confirmation"],
  ["preparing", "Preparing"],
  ["ready", "Ready"],
  ["holding", "Holding as planned"],
  ["held", "Held"],
  ["not_holding", "Not holding"],
];

const STATUS_COLORS = {
  confirmed: "border-teal-300 bg-teal-50 text-teal-700",
  pending: "border-slate-300 bg-slate-100 text-slate-700",
  preparing: "border-amber-300 bg-amber-50 text-amber-700",
  ready: "border-emerald-300 bg-emerald-50 text-emerald-700",
  holding: "border-blue-300 bg-blue-50 text-blue-700",
  held: "border-green-300 bg-green-50 text-green-700",
  not_holding: "border-red-300 bg-red-50 text-red-700",
};

function StatusBadge({ status = "pending" }) {
  return <span className={`inline-flex border px-2 py-1 text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.pending}`}>
    {STATUS_OPTIONS.find(([value]) => value === status)?.[1] || "Pending confirmation"}
  </span>;
}

export function CrusadeEditor({ crusade, savePath, onSaved }) {
  const [details, setDetails] = React.useState({
    event_type: crusade.event_type || "", event_name: crusade.event_name || "", event_date: crusade.event_date || "",
    venue: crusade.venue || "", expected_attendance: crusade.expected_attendance || "", minister_name: crusade.minister_name || "",
    city: crusade.city || "", city_place_id: crusade.city_place_id || "",
    crusade_collaborators: splitCollaboration(crusade.crusade_collaborators),
    zone_contribution: splitCollaboration(crusade.zone_contribution),
    estimated_budget: crusade.estimated_budget || "",
    rhapsody_copies_confirmed: crusade.rhapsody_copies_confirmed || "",
    permits_obtained: crusade.permits_obtained || "",
    media_coverage_plan: crusade.media_coverage_plan || "",
  });
  const [status, setStatus] = React.useState(crusade.readiness_status || "pending");
  const [feedback, setFeedback] = React.useState(crusade.readiness_notes || "");
  const [saving, setSaving] = React.useState(false);

  const fetchCities = useCityFetcher(crusade.country);
  const { fetchCollaborators } = useOrgData("", "");

  // The network-only planning fields lock once the crusade date has passed.
  const isNetwork = crusade.organization_type === "network";
  const planningEditable = !details.event_date || details.event_date >= todayISO();
  const setField = (field) => (event) => setDetails((current) => ({ ...current, [field]: event.target.value }));

  async function save() {
    if (status === "not_holding" && feedback.trim().length < 3) {
      return toast.error("Please explain why the crusade is not holding and include any challenges.");
    }
    setSaving(true);
    try {
      const updated = await putJSON(savePath, { ...details, status, feedback });
      // The server returns collaboration as comma-joined strings; keep our editing
      // copy as arrays so a second save in the same dialog still works.
      setDetails((current) => ({
        ...current, ...updated,
        crusade_collaborators: splitCollaboration(updated.crusade_collaborators),
        zone_contribution: splitCollaboration(updated.zone_contribution),
      }));
      setFeedback(updated.readiness_notes || "");
      onSaved(updated);
      toast.success("Crusade readiness updated.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Crusade type" required>
          <Select value={details.event_type} onChange={(event) => setDetails((current) => ({ ...current, event_type: event.target.value }))}>
            {CRUSADE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Crusade name" required>
          <Input value={details.event_name} onChange={(event) => setDetails((current) => ({ ...current, event_name: event.target.value }))} />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={details.event_date} onChange={(event) => setDetails((current) => ({ ...current, event_date: event.target.value }))} />
        </Field>
        <Field label="Expected attendance" required>
          <Input type="number" min="1" value={details.expected_attendance} onChange={(event) => setDetails((current) => ({ ...current, expected_attendance: event.target.value }))} />
        </Field>
        <Field label="Country">
          <Input value={crusade.country || "—"} readOnly aria-readonly="true" className="cursor-not-allowed text-muted-foreground" />
        </Field>
        <Field label="City" required>
          <Combobox value={details.city} fetcher={fetchCities} minChars={2} allowCreate ariaLabel="City" placeholder="Search city"
            searchPlaceholder="Search city…" emptyText="No cities found"
            onSelect={(option) => setDetails((current) => ({ ...current, ...citySelectionFields(option) }))} />
        </Field>
        <Field label="Venue / address" required className="lg:col-span-2">
          <Input value={details.venue} onChange={(event) => setDetails((current) => ({ ...current, venue: event.target.value }))} />
        </Field>
        <Field label="Ministers' names" required>
          <Input value={details.minister_name} onChange={(event) => setDetails((current) => ({ ...current, minister_name: event.target.value }))} />
        </Field>
      </div>
      {isNetwork && (
        <div className="space-y-4 border-t border-dashed pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Who are the crusade collaborators?</p>
              {planningEditable ? (
                <CollaboratorPicker value={details.crusade_collaborators} fetcher={fetchCollaborators}
                  onChange={(value) => setDetails((current) => ({ ...current, crusade_collaborators: value }))} />
              ) : (
                <p className="text-sm">{details.crusade_collaborators.join(", ") || "—"}</p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Zone’s contribution to crusade</p>
              {planningEditable ? (
                <ContributionChecklist value={details.zone_contribution}
                  onChange={(value) => setDetails((current) => ({ ...current, zone_contribution: value }))} />
              ) : (
                <p className="text-sm">{details.zone_contribution.join(", ") || "—"}</p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Estimated crusade budget (Espees)</p>
              {planningEditable ? (
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm font-medium text-muted-foreground">Espees</span>
                  <Input value={details.estimated_budget} onChange={setField("estimated_budget")} placeholder="e.g. 2,000,000" />
                </div>
              ) : (
                <p className="text-sm">{details.estimated_budget ? `Espees ${details.estimated_budget}` : "—"}</p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Number of Rhapsody copies confirmed</p>
              {planningEditable ? (
                <Input type="number" min="0" value={details.rhapsody_copies_confirmed} onChange={setField("rhapsody_copies_confirmed")} placeholder="e.g. 5,000" />
              ) : (
                <p className="text-sm">{details.rhapsody_copies_confirmed || "—"}</p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Required permits obtained? (where applicable)</p>
              {planningEditable ? (
                <Select value={details.permits_obtained} onChange={setField("permits_obtained")}>
                  <option value="">Select…</option>
                  {PERMIT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </Select>
              ) : (
                <p className="text-sm">{details.permits_obtained || "—"}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Media coverage plan</p>
              {planningEditable ? (
                <Textarea rows={3} maxLength={2000} value={details.media_coverage_plan} onChange={setField("media_coverage_plan")} placeholder="TV, radio, social media, press…" />
              ) : (
                <p className="whitespace-pre-wrap text-sm">{details.media_coverage_plan || "—"}</p>
              )}
            </div>
          </div>
          {!planningEditable && (
            <p className="text-xs text-muted-foreground">These planning details are locked because the crusade date has passed.</p>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <StatusBadge status={status} />
          {status === "held" ? (
            <p className="text-xs text-muted-foreground">This is a legacy status. Held is now determined when a report is submitted.</p>
          ) : (
            <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Crusade readiness status">
              {STATUS_OPTIONS.filter(([value]) => value !== "held").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          )}
        </div>
        <Textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={3} maxLength={2000}
          placeholder={status === "not_holding" ? "Required: why is it not holding? Include challenges or support needed." : "Readiness details, progress, challenges or support needed…"}
          aria-label="Readiness details and challenges" />
        <Button type="button" size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  );
}
