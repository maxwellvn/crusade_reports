import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, CheckCircle2, FileSpreadsheet, FileText, Loader2, MapPin, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { CrusadeReportDialog } from "@/components/ZonePortal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postJSON } from "@/lib/api";
import { uploadForm } from "@/lib/upload";
import { UploadProgress } from "@/components/UploadProgress";
import { typeLabel } from "@/lib/dashboardWidgets";
import "../landing.css";

// Past this many pending registrations, one-at-a-time reporting is hopeless —
// offer the Excel bulk flow (same template format as the zone portals).
export const BULK_REPORT_THRESHOLD = 50;

async function downloadBulkTemplate(lookup) {
  const response = await fetch("/api/registrations/find/bulk-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lookup }),
  });
  if (!response.ok) {
    let body = null;
    try { body = await response.json(); } catch { /* non-JSON error */ }
    throw new Error(body?.error?.message || "Could not generate the template. Please try again.");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "your-crusade-report-template.xlsx";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function BulkReportCard({ lookup, onCommitted }) {
  const [file, setFile] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [progress, setProgress] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);

  async function getTemplate() {
    setBusy(true);
    try {
      await downloadBulkTemplate(lookup);
      toast.success("Template downloaded — fill the green columns and upload it back here.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function send(selectedFile, commit = false) {
    setBusy(true);
    setProgress({ phase: "uploading", percent: 0, bytesPerSecond: 0 });
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("lookup", lookup);
      const result = await uploadForm(`/registrations/find/bulk-report${commit ? "?commit=1" : ""}`, fd, { onProgress: setProgress });
      setProgress({ phase: "complete", percent: 100 });
      if (!result.committed) {
        setPreview(result);
        toast.info(`${result.summary?.reports ?? 0} ${result.summary?.reports === 1 ? "report" : "reports"} ready — review and confirm below.`);
      } else {
        toast.success(`${result.submitted} new ${result.submitted === 1 ? "report" : "reports"} submitted${result.skipped_already_submitted ? `; ${result.skipped_already_submitted} already-submitted ${result.skipped_already_submitted === 1 ? "row was" : "rows were"} skipped` : ""}.`);
        setFile(null);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
        onCommitted?.();
      }
    } catch (e) {
      setProgress({ phase: "error", message: e.message });
      toast.error(e.message);
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(null), 1200);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="size-4 text-blue-700" />
        <p className="text-sm font-semibold text-blue-950">Many crusades to report? Use the Excel bulk upload.</p>
      </div>
      <p className="mt-1 text-xs leading-5 text-blue-900">
        1. Download the template — it lists your unreported crusades. 2. Fill the green report columns. 3. Upload it back here.
        Already-submitted crusades in the file are skipped automatically.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={getTemplate} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Download template
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload /> {file ? "Choose another file" : "Upload completed template"}
        </Button>
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); setPreview(null); if (f) send(f); }} />
      </div>
      <div className="mt-3"><UploadProgress progress={progress} /></div>
      {preview && (
        <div className="mt-3 space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">
            {preview.summary?.reports ?? 0} reports ready · {(preview.summary?.attendance ?? 0).toLocaleString()} attendance · {(preview.summary?.salvations ?? 0).toLocaleString()} salvations
            {preview.summary?.already_submitted ? ` · ${preview.summary.already_submitted} already-submitted rows will be skipped` : ""}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => send(file, true)}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />} Confirm and submit
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setFile(null); setPreview(null); if (inputRef.current) inputRef.current.value = ""; }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function displayDate(value) {
  if (!value) return "Date not provided";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function crusadeName(crusade) {
  return crusade.event_name || (crusade.event_type === "other" ? crusade.other_event_type : typeLabel(crusade.event_type)) || "Registered crusade";
}

export function FindCrusadeReport() {
  const [entry, setEntry] = React.useState("");
  const [lookup, setLookup] = React.useState("");
  const [rows, setRows] = React.useState(null);
  const [searching, setSearching] = React.useState(false);
  const [selected, setSelected] = React.useState(null);
  const [lastLookup, setLastLookup] = React.useState("");
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [totalPending, setTotalPending] = React.useState(0);

  async function search(event) {
    event.preventDefault();
    const value = entry.trim();
    if (value.length < 2) return toast.error("Enter your email address or KingsChat username.");
    setSearching(true);
    try {
      const result = await postJSON("/registrations/find", { lookup: value });
      setLookup(value);
      setEntry("");
      setRows(result.rows || []);
      setTotalPending(result.total_pending || 0);
      setLastLookup(value);
    } catch (error) {
      toast.error(error.message || "Could not search for your crusades.");
    } finally {
      setSearching(false);
    }
  }

  function resetSearch() {
    setRows(null);
    setLookup("");
    setSelected(null);
    setLastLookup("");
  }

  function markSubmitted(crusade, submitted) {
    setRows((current) => current.map((row) => row.id === crusade.id
      ? { ...row, report_crusade_id: submitted?.report_crusade_id || true, report_id: submitted?.report_id, reported_at: submitted?.reported_at || new Date().toISOString() }
      : row));
    setSelected(null);
  }

  // Bulk flow refreshed the server — re-run the search so badges reflect it.
  async function refreshAfterBulk() {
    if (!lastLookup) return;
    try {
      const result = await postJSON("/registrations/find", { lookup: lastLookup });
      setRows(result.rows || []);
      setTotalPending(result.total_pending || 0);
    } catch { /* keep stale rows; toast already confirmed submission */ }
  }

  return (
    <div className="reg-page">
      <header className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="reg-header mx-auto flex h-14 max-w-3xl items-center justify-between rounded-full pl-3 pr-4 backdrop-blur-md">
          <Link to="/crusade-registration" className="flex min-w-0 items-center gap-2.5">
            <img src="/logo.png" alt="Rhapsody End-Time Teaching Crusades" className="h-8 w-auto shrink-0" />
            <span className="hidden truncate text-sm font-semibold sm:block">A Night of a Thousand Crusades</span>
          </Link>
          <a href="https://rhapsodycrusades.org" target="_blank" rel="noreferrer"
            className="reg-header-link inline-flex shrink-0 items-center gap-1 text-sm font-semibold transition-colors">
            <span className="hidden sm:inline">rhapsodycrusades.org</span><span className="sm:hidden">Website</span> <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </header>

      <main className="reg-main">
        <div className="reg-card">
          <div className="space-y-2">
            <p className="reg-eyebrow text-sm font-semibold uppercase tracking-[0.35px]">Crusade reports</p>
            <h1 className="reg-title text-3xl tracking-[-0.9px] sm:text-4xl">Find your crusade.</h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">Search for a registered crusade, select it, and submit the completed crusade report.</p>
          </div>

          {rows === null ? (
            <section aria-labelledby="crusade-search-heading" className="mt-8 border-t pt-6">
              <h2 id="crusade-search-heading" className="text-base font-semibold">Search registrations</h2>
              <p className="mt-1 text-sm text-muted-foreground">Use the same email address or KingsChat username entered during registration.</p>
              <form onSubmit={search} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 text-sm font-medium">
                  Email address or KingsChat username
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={entry} onChange={(event) => setEntry(event.target.value)} className="h-11 pl-9"
                      placeholder="Enter email or KingsChat username" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
                  </div>
                </label>
                <Button type="submit" className="h-11 sm:min-w-36" disabled={searching}>{searching ? "Searching..." : "Find crusades"}</Button>
              </form>
              {lastLookup && (
                <p className="mt-4 text-sm text-muted-foreground">
                  <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={search}>Search again</button>
                  {" "}for {lastLookup}, or use{" "}
                  <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => setBulkOpen((o) => !o)}>the bulk upload</button>.
                </p>
              )}
              {lastLookup && bulkOpen && <BulkReportCard lookup={lastLookup} onCommitted={refreshAfterBulk} />}
            </section>
          ) : (
            <section aria-labelledby="registration-results-heading" className="mt-8 animate-step-in motion-reduce:animate-none">
              <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="registration-results-heading" className="text-xl font-semibold">Registered crusades</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Showing {rows.length} {rows.length === 1 ? "registration" : "registrations"}
                    {totalPending > rows.length ? ` of ${totalPending.toLocaleString()} total` : ""}.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={resetSearch}><Search /> Search again</Button>
              </div>

              {totalPending > BULK_REPORT_THRESHOLD && (
                <BulkReportCard lookup={lookup} onCommitted={refreshAfterBulk} />
              )}

              {!rows.length ? (
                <div className="border-b py-12 text-center">
                  <FileText className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">No registered crusades were found.</p>
                  <p className="mt-1 text-sm text-muted-foreground">Check the email address or KingsChat username and search again.</p>
                </div>
              ) : (
                <div className="divide-y border-b">
                  {rows.map((crusade) => {
                    const submitted = Boolean(crusade.report_crusade_id);
                    return (
                      <article key={crusade.id} className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 text-base font-semibold">{crusadeName(crusade)}</h3>
                            <Badge variant="outline">{crusade.event_type === "other" ? crusade.other_event_type : typeLabel(crusade.event_type)}</Badge>
                            <Badge className={submitted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                              {submitted ? "Report submitted" : "Report pending"}
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" />{displayDate(crusade.event_date)}</span>
                            <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" />{[crusade.city, crusade.country].filter(Boolean).join(", ") || "Location not provided"}</span>
                          </div>
                        </div>
                        {submitted ? (
                          <div className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="size-5" /> Completed</div>
                        ) : (
                          <Button type="button" onClick={() => setSelected(crusade)}><FileText /> Submit report</Button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {selected && (
        <CrusadeReportDialog
          crusade={selected}
          savePath={`/registrations/find/${selected.id}/report`}
          submissionContext={{ lookup }}
          onClose={() => setSelected(null)}
          onSubmitted={(submitted) => markSubmitted(selected, submitted)}
          onAlreadySubmitted={() => markSubmitted(selected, {})}
        />
      )}
    </div>
  );
}
