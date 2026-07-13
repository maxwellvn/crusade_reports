import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { LoadingRows } from "@/components/ui/skeleton";
import { Combobox } from "@/components/Combobox";
import { getJSON, postJSON, putJSON } from "@/lib/api";
import { nfull, orgHierarchy, typeLabel, StatSlab } from "@/lib/dashboardWidgets";
import { CORE_OUTCOMES, CRUSADE_TYPES, EXTENDED_OUTCOMES, FORMATS, METRIC_KEYS, ONLINE_TYPES } from "@/lib/constants";

// Zone dashboard, opened via a capability link (/zone/<token>). The server
// scopes every read and readiness update to the token's zone/network.

export function ZonePortal() {
  const { token } = useParams();
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [openCrusade, setOpenCrusade] = React.useState(null);
  const [reportingCrusade, setReportingCrusade] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState("registrations");
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("");
  const [readinessFilter, setReadinessFilter] = React.useState("");

  React.useEffect(() => {
    getJSON(`/zone-portal/${token}`).then(setData).catch((e) => setError(e.message));
  }, [token]);

  if (error)
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6">
        <div className="max-w-md space-y-4 text-center">
          <img src="/logo.png" alt="" className="mx-auto h-10 w-auto" />
          <h1 className="text-2xl tracking-tight">This link isn’t valid.</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );

  const editingCrusade = data?.items.find((item) => item.id === openCrusade) || null;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = (data?.items || []).filter((item) => {
    const searchable = [item.event_name, item.event_type, typeLabel(item.event_type), item.country, item.city, item.venue, item.event_date]
      .filter(Boolean).join(" ").toLowerCase();
    return (!normalizedQuery || searchable.includes(normalizedQuery))
      && (!typeFilter || item.event_type === typeFilter)
      && (!readinessFilter || item.readiness_status === readinessFilter);
  });
  const filteredUnregistered = (data?.crusades || []).filter((crusade) => !crusade.registration_item_id && (!normalizedQuery
    || [crusade.event_name, crusade.event_type, typeLabel(crusade.event_type), crusade.country, crusade.city, crusade.venue, crusade.event_date]
      .filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery)));

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
            {data.reporting_open && <Button asChild size="sm"><Link to={`/report?portal=${encodeURIComponent(token)}`}>Report unregistered crusade</Link></Button>}
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

            <Card>
              <CardContent className="grid gap-2 pt-6 sm:grid-cols-[1fr_13rem_13rem]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9"
                    placeholder="Search crusades by name, city, venue or date…" aria-label="Search crusades" />
                </div>
                <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by crusade type">
                  <option value="">All crusade types</option>
                  {CRUSADE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
                <Select value={readinessFilter} onChange={(event) => setReadinessFilter(event.target.value)} aria-label="Filter by readiness">
                  <option value="">All readiness statuses</option>
                  <option value="pending">Pending confirmation</option>
                  <option value="preparing">Preparing</option>
                  <option value="ready">Ready</option>
                  <option value="holding">Holding as planned</option>
                  <option value="not_holding">Not holding</option>
                </Select>
              </CardContent>
            </Card>

            <div className="flex border-b" role="tablist" aria-label="Crusade records">
              {[['registrations', 'Registrations'], ...(data.reporting_open ? [['reports', 'Reports']] : [])].map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={activeTab === value}
                  onClick={() => setActiveTab(value)}
                  className={`border-b-2 px-4 py-2 text-sm font-medium ${activeTab === value ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "registrations" && <Card>
              <CardHeader>
                <CardTitle className="text-sm">Registered crusades</CardTitle>
                <CardDescription>Open a particular crusade to update its readiness and confirmation.</CardDescription>
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
                            <td className="py-2 pr-3 text-right">{nfull.format(item.expected_attendance || 0)}</td>
                            <td className="py-2">
                              <StatusBadge status={item.readiness_status} />
                            </td>
                            <td className="py-2 text-right">
                              <Button type="button" variant="outline" size="sm" onClick={() => setOpenCrusade(item.id)}>
                                Edit
                              </Button>
                            </td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>}

            {!data.reporting_open && <Card><CardContent className="pt-6 text-sm text-muted-foreground">
              Reporting has not opened yet. The Reports tab will appear here when the super admin opens reporting.
            </CardContent></Card>}

            {data.reporting_open && activeTab === "reports" && <Card>
              <CardHeader>
                <CardTitle className="text-sm">Crusade reports</CardTitle>
                <CardDescription>Submit outcomes for each registered crusade individually.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 overflow-x-auto">
                <div className="flex flex-wrap items-center justify-between gap-3 border p-4">
                  <div>
                    <p className="text-sm font-medium">Didn’t register a crusade?</p>
                    <p className="text-xs text-muted-foreground">Report every unregistered crusade you held using the standalone form.</p>
                  </div>
                  <Button asChild variant="outline" size="sm"><Link to={`/report?portal=${encodeURIComponent(token)}`}>Report unregistered crusade</Link></Button>
                </div>
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
                        <th className="py-2 pr-3 font-medium">Report status</th>
                        <th className="py-2 pr-3 text-right font-medium">Attendance</th>
                        <th className="py-2 pr-3 text-right font-medium">Souls won</th>
                        <th className="py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {filteredItems.map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap">{item.event_date || "—"}</td>
                          <td className="max-w-52 py-2 pr-3 font-medium">{item.event_name || typeLabel(item.event_type)}</td>
                          <td className="py-2 pr-3">{typeLabel(item.event_type)}</td>
                          <td className="max-w-40 py-2 pr-3">{item.country || "—"}</td>
                          <td className="max-w-56 py-2 pr-3 text-muted-foreground">{[item.city, item.venue].filter(Boolean).join(" · ") || "—"}</td>
                          <td className="min-w-64 max-w-80 py-2 pr-3 text-xs">{orgHierarchy(item)}</td>
                          <td className="py-2 pr-3"><ReportStatusBadge reported={!!item.report_id} /></td>
                          <td className="py-2 pr-3 text-right">{item.report_id ? nfull.format((item.reported_attendance || 0) + (item.reported_online_participation || 0)) : "—"}</td>
                          <td className="py-2 pr-3 text-right">{item.report_id ? nfull.format(item.reported_salvation || 0) : "—"}</td>
                          <td className="py-2 text-right">
                            <Button type="button" size="sm" disabled={!!item.report_id} onClick={() => setReportingCrusade(item)}>
                              {item.report_id ? "Submitted" : "Submit report"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {filteredUnregistered.length > 0 && <div className="space-y-3 border-t pt-5">
                  <div>
                    <p className="text-sm font-medium">Reports without prior registration</p>
                    <p className="text-xs text-muted-foreground">Crusades reported through the “didn’t register” form.</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Crusade</th>
                      <th className="py-2 pr-3 font-medium">Country</th><th className="py-2 pr-3 font-medium">Location</th>
                      <th className="py-2 pr-3 font-medium">Reporting type</th>
                      <th className="py-2 pr-3 text-right font-medium">Attendance</th><th className="py-2 text-right font-medium">Souls won</th>
                    </tr></thead>
                    <tbody className="tabular-nums">
                      {filteredUnregistered.map((crusade) => <tr key={crusade.id} className="border-b last:border-0">
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
              </CardContent>
            </Card>}
            {editingCrusade && (
              <ZoneCrusadeEditDialog crusade={editingCrusade} token={token} onClose={() => setOpenCrusade(null)} onSaved={(updated) => {
                setData((current) => ({ ...current, items: current.items.map((item) => item.id === editingCrusade.id ? { ...item, ...updated } : item) }));
              }} />
            )}
            {reportingCrusade && (
              <CrusadeReportDialog crusade={reportingCrusade} token={token} onClose={() => setReportingCrusade(null)}
                onSubmitted={(report) => {
                  setData((current) => ({
                    ...current,
                    totals: {
                      ...current.totals,
                      held: current.totals.held + 1,
                      attendance: current.totals.attendance + (report.reported_attendance || 0) + (report.reported_online_participation || 0),
                      salvation: current.totals.salvation + (report.reported_salvation || 0),
                    },
                    items: current.items.map((item) => item.id === reportingCrusade.id ? { ...item, ...report } : item),
                  }));
                  setReportingCrusade(null);
                }} />
            )}
          </>
        )}
      </main>
    </div>
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

function ReportStatusBadge({ reported }) {
  return <span className={`inline-flex border px-2 py-1 text-xs font-medium ${reported
    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
    : "border-amber-300 bg-amber-50 text-amber-700"}`}>
    {reported ? "Submitted" : "Not submitted"}
  </span>;
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

export function CrusadeReportDialog({ crusade, token, savePath, onClose, onSubmitted }) {
  const ref = React.useRef(null);
  const [saving, setSaving] = React.useState(false);
  const [report, setReport] = React.useState({
    format: ONLINE_TYPES.includes(crusade.event_type) ? "online" : "physical",
    event_type: crusade.event_type || "", other_event_type: "", event_name: crusade.event_name || "",
    city: crusade.city || "", city_place_id: crusade.city_place_id || "", event_date: crusade.event_date || "",
    attendance: 0, minister_name: crusade.minister_name || "", venue: crusade.venue || "",
    ...Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])),
  });
  const [highlights, setHighlights] = React.useState("");
  const [mediaLinks, setMediaLinks] = React.useState("");
  const fetchCities = useCityFetcher(crusade.country);

  React.useEffect(() => { ref.current?.showModal(); }, []);
  const setField = (field, value) => setReport((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    const required = [report.format, report.event_type, report.event_name, report.city, report.event_date, report.minister_name, report.venue];
    if (required.some((value) => !String(value || "").trim()) || (report.event_type === "other" && !report.other_event_type.trim())) {
      return toast.error("Please complete all required report details.");
    }
    setSaving(true);
    try {
      const numericReport = { ...report, attendance: Number(report.attendance) || 0 };
      METRIC_KEYS.forEach((key) => { numericReport[key] = Number(report[key]) || 0; });
      const submitted = await postJSON(savePath || `/zone-portal/${token}/crusades/${crusade.id}/report`, {
        crusade: numericReport, highlights, media_links: mediaLinks,
      });
      toast.success("Crusade report submitted.");
      onSubmitted(submitted);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      className="max-h-[calc(100vh-2rem)] w-[min(60rem,calc(100%-2rem))] overflow-y-auto border bg-background p-0 text-foreground backdrop:bg-black/60">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-background p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Submit crusade report</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{crusade.event_name || typeLabel(crusade.event_type)}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => ref.current?.close()} aria-label="Close report form"><X /></Button>
      </div>
      <form onSubmit={submit} className="space-y-5 p-5">
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
            <Combobox value={report.city} fetcher={fetchCities} minChars={2} placeholder="Search city" searchPlaceholder="Search city…"
              emptyText="No cities found" onSelect={(city) => setReport((current) => ({ ...current, city: city.label, city_place_id: city.value }))} />
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

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Highlights (optional)">
            <Textarea rows={4} maxLength={2000} value={highlights} onChange={(event) => setHighlights(event.target.value)} placeholder="Notable testimonies or moments…" />
          </Field>
          <Field label="Media links (optional)">
            <Textarea rows={4} maxLength={4000} value={mediaLinks} onChange={(event) => setMediaLinks(event.target.value)} placeholder="One Google Drive, YouTube or other link per line…" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => ref.current?.close()}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Submitting…" : "Submit report"}</Button>
        </div>
      </form>
    </dialog>
  );
}

const STATUS_OPTIONS = [
  ["pending", "Pending confirmation"],
  ["preparing", "Preparing"],
  ["ready", "Ready"],
  ["holding", "Holding as planned"],
  ["held", "Held"],
  ["not_holding", "Not holding"],
];

const STATUS_COLORS = {
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
  });
  const [status, setStatus] = React.useState(crusade.readiness_status || "pending");
  const [feedback, setFeedback] = React.useState(crusade.readiness_notes || "");
  const [saving, setSaving] = React.useState(false);

  const fetchCities = useCityFetcher(crusade.country);

  async function save() {
    if (status === "not_holding" && feedback.trim().length < 3) {
      return toast.error("Please explain why the crusade is not holding and include any challenges.");
    }
    setSaving(true);
    try {
      const updated = await putJSON(savePath, { ...details, status, feedback });
      setDetails((current) => ({ ...current, ...updated }));
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
          <Combobox value={details.city} fetcher={fetchCities} minChars={2} placeholder="Search city"
            searchPlaceholder="Search city…" emptyText="No cities found"
            onSelect={(city) => setDetails((current) => ({ ...current, city: city.label, city_place_id: city.value }))} />
        </Field>
        <Field label="Venue / address" required className="lg:col-span-2">
          <Input value={details.venue} onChange={(event) => setDetails((current) => ({ ...current, venue: event.target.value }))} />
        </Field>
        {details.event_type === "mega" && (
          <Field label="Ministers' names" required>
            <Input value={details.minister_name} onChange={(event) => setDetails((current) => ({ ...current, minister_name: event.target.value }))} />
          </Field>
        )}
      </div>
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
