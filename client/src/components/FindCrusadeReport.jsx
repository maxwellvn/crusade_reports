import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, CheckCircle2, FileText, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { CrusadeReportDialog } from "@/components/ZonePortal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postJSON } from "@/lib/api";
import { typeLabel } from "@/lib/dashboardWidgets";
import "../landing.css";

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
  }

  function markSubmitted(crusade, submitted) {
    setRows((current) => current.map((row) => row.id === crusade.id
      ? { ...row, report_crusade_id: submitted?.report_crusade_id || true, report_id: submitted?.report_id, reported_at: submitted?.reported_at || new Date().toISOString() }
      : row));
    setSelected(null);
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
            </section>
          ) : (
            <section aria-labelledby="registration-results-heading" className="mt-8 animate-step-in motion-reduce:animate-none">
              <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="registration-results-heading" className="text-xl font-semibold">Registered crusades</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? "registration" : "registrations"} found.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={resetSearch}><Search /> Search again</Button>
              </div>

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
