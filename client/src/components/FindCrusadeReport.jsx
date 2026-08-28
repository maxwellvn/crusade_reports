import * as React from "react";
import { CalendarDays, CheckCircle2, FileText, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { CrusadeReportDialog } from "@/components/ZonePortal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postJSON } from "@/lib/api";
import { typeLabel } from "@/lib/dashboardWidgets";

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
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-blue-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <img src="/logo.png" alt="" className="h-11 w-auto shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Rhapsody End-Time Teaching Crusades</p>
            <p className="truncate text-xs text-slate-500">Crusade reporting</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase text-blue-700">Crusade reports</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">Find your crusade</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Search for a registered crusade, select it, and submit the completed crusade report.</p>
        </div>

        {rows === null ? (
          <section aria-labelledby="crusade-search-heading" className="mt-8 max-w-2xl border-y border-slate-200 bg-white py-6">
            <h2 id="crusade-search-heading" className="text-base font-semibold">Search registrations</h2>
            <form onSubmit={search} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
                Email address or KingsChat username
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input value={entry} onChange={(event) => setEntry(event.target.value)} className="h-11 pl-9"
                    placeholder="Enter email or KingsChat username" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
                </div>
              </label>
              <Button type="submit" className="h-11" disabled={searching}>{searching ? "Searching..." : "Find crusades"}</Button>
            </form>
          </section>
        ) : (
          <section aria-labelledby="registration-results-heading" className="mt-8">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="registration-results-heading" className="text-xl font-semibold">Registered crusades</h2>
                <p className="mt-1 text-sm text-slate-600">{rows.length} {rows.length === 1 ? "registration" : "registrations"} found.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={resetSearch}><Search /> Search again</Button>
            </div>

            {!rows.length ? (
              <div className="border-b border-slate-200 bg-white py-12 text-center">
                <FileText className="mx-auto size-8 text-slate-400" />
                <p className="mt-3 text-sm font-medium text-slate-800">No registered crusades were found.</p>
                <p className="mt-1 text-sm text-slate-500">Check the email address or KingsChat username and search again.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border-b border-slate-200 bg-white">
                {rows.map((crusade) => {
                  const submitted = Boolean(crusade.report_crusade_id);
                  return (
                    <article key={crusade.id} className="grid gap-4 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 text-base font-semibold text-slate-950">{crusadeName(crusade)}</h3>
                          <Badge variant="outline" className="bg-slate-50 text-slate-700">{crusade.event_type === "other" ? crusade.other_event_type : typeLabel(crusade.event_type)}</Badge>
                          <Badge className={submitted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                            {submitted ? "Report submitted" : "Report pending"}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4 text-slate-400" />{displayDate(crusade.event_date)}</span>
                          <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-slate-400" />{[crusade.city, crusade.country].filter(Boolean).join(", ") || "Location not provided"}</span>
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
