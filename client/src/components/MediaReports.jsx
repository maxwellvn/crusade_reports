import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronDown, ExternalLink, Film, Image, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingRows } from "@/components/ui/skeleton";
import { Pagination } from "@/lib/tableTools";
import { getJSON, patchJSON } from "@/lib/api";
import { typeLabel, orgHierarchy, nfull } from "@/lib/dashboardWidgets";

const PAGE_SIZE = 30;
const REVIEW_STATUSES = [
  ["new", "New"],
  ["reviewed", "Reviewed"],
  ["follow_up", "Needs follow-up"],
];
const STATUS_STYLES = {
  new: "bg-blue-100 text-blue-800",
  reviewed: "bg-emerald-100 text-emerald-800",
  follow_up: "bg-amber-100 text-amber-900",
};
const FILTERS = [
  ["event_type", "Crusade type", "event-type"],
  ["format", "Format", "fixed", [["physical", "Physical"], ["online", "Online"]]],
  ["media_type", "Media", "fixed", [["uploaded", "Uploaded photos"], ["photos", "Photos"], ["videos", "Video links"]]],
  ["review_status", "Review status", "fixed", REVIEW_STATUSES],
  ["zone", "Zone", "dynamic"],
  ["network_name", "Network", "dynamic"],
  ["country", "Country", "dynamic"],
  ["city", "City", "dynamic"],
  ["date_from", "Date from", "date"],
  ["date_to", "Date to", "date"],
];

function displayDate(value, withTime = false) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + (value.length === 10 ? "T00:00:00" : "Z");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", withTime
    ? { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function extractLinks(value) {
  const links = String(value || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
  return [...new Set(links.map((link) => link.replace(/[),.;]+$/, "")))];
}

function reportTitle(report) {
  const first = report.crusades?.[0];
  return first?.event_name || (first?.event_type === "other" ? first.other_event_type : typeLabel(first?.event_type)) || `Report ${report.id}`;
}

function ReviewBadge({ status }) {
  return <Badge className={STATUS_STYLES[status] || STATUS_STYLES.new}>{REVIEW_STATUSES.find(([value]) => value === status)?.[1] || "New"}</Badge>;
}

function MediaReportDetail({ reportId, onClose, onReviewChanged }) {
  const ref = React.useRef(null);
  const [report, setReport] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    getJSON(`/reports/media/${reportId}`)
      .then((result) => { setReport(result); requestAnimationFrame(() => ref.current?.showModal()); })
      .catch((error) => { toast.error(error.message || "Could not open this media report."); onClose(); });
  }, [reportId, onClose]);

  async function setReviewStatus(status) {
    setSaving(true);
    try {
      await patchJSON(`/reports/media/${report.id}/review`, { status });
      setReport((current) => ({ ...current, review_status: status }));
      onReviewChanged(report.id, status);
      toast.success("Media review status updated.");
    } catch (error) {
      toast.error(error.message || "Could not update the review status.");
    } finally {
      setSaving(false);
    }
  }

  if (!report) return null;
  const photoLinks = extractLinks(report.photo_links);
  const videoLinks = extractLinks(report.video_links);
  const legacyLinks = !photoLinks.length && !videoLinks.length ? extractLinks(report.media_links) : [];

  return (
    <dialog ref={ref} onClose={onClose} onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      className="m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-5xl overflow-hidden border bg-white p-0 text-slate-950 shadow-xl backdrop:bg-slate-950/60 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)]">
      <div className="flex max-h-[calc(100dvh-1rem)] flex-col sm:max-h-[calc(100dvh-2rem)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase text-blue-700">Media report {report.id}</p><ReviewBadge status={report.review_status} /></div>
            <h2 className="mt-2 text-xl font-semibold sm:text-2xl">{reportTitle(report)}</h2>
            <p className="mt-1 text-sm text-slate-500">Submitted {displayDate(report.created_at, true)}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => ref.current?.close()} aria-label="Close media report"><X /></Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <section aria-labelledby="review-heading" className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div><h3 id="review-heading" className="text-sm font-semibold">Media review</h3><p className="mt-1 text-sm text-slate-500">Update the status as the submitted media is checked.</p></div>
            <Field label="Review status" className="w-full sm:w-52">
              <Select value={report.review_status} disabled={saving} onChange={(event) => setReviewStatus(event.target.value)}>
                {REVIEW_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
          </section>

          <section aria-labelledby="crusades-heading" className="border-b border-slate-200 py-5">
            <h3 id="crusades-heading" className="text-sm font-semibold">Crusades in this report</h3>
            {report.crusades.length > 1 && <p className="mt-1 text-sm text-slate-500">The media was submitted with a report containing {report.crusades.length} crusades and is shared across them.</p>}
            <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {report.crusades.map((crusade) => (
                <div key={crusade.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0"><p className="font-medium text-slate-900">{crusade.event_name || typeLabel(crusade.event_type)}</p><p className="mt-1 text-slate-500">{crusade.event_type === "other" ? crusade.other_event_type : typeLabel(crusade.event_type)} · {crusade.format}</p></div>
                  <div className="space-y-1 text-slate-600 sm:text-right"><p>{displayDate(crusade.event_date)}</p><p>{[crusade.city, crusade.country].filter(Boolean).join(", ")}</p></div>
                </div>
              ))}
            </div>
          </section>

          {report.highlights && <section className="border-b border-slate-200 py-5"><h3 className="text-sm font-semibold">Highlights</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{report.highlights}</p></section>}

          <section aria-labelledby="uploaded-photos-heading" className="border-b border-slate-200 py-5">
            <div className="flex items-center justify-between gap-3"><h3 id="uploaded-photos-heading" className="text-sm font-semibold">Uploaded photos</h3><span className="text-sm tabular-nums text-slate-500">{report.photos.length}</span></div>
            {!report.photos.length ? <p className="mt-3 text-sm text-slate-500">No photos were uploaded with this report.</p> : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {report.photos.map((photo) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-md border border-slate-200 bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <div className="aspect-square overflow-hidden bg-slate-100"><img src={photo.url} alt={photo.original_name || "Submitted crusade photo"} loading="lazy" className="size-full object-cover transition-opacity group-hover:opacity-90" /></div>
                    <p className="truncate px-2 py-2 text-xs text-slate-600">{photo.original_name}</p>
                  </a>
                ))}
              </div>
            )}
          </section>

          <MediaLinks title="Photo links" icon={Image} links={photoLinks} />
          <MediaLinks title="Video links" icon={Film} links={videoLinks} />
          <MediaLinks title="Other media links" icon={ExternalLink} links={legacyLinks} />
        </div>
      </div>
    </dialog>
  );
}

function MediaLinks({ title, icon: Icon, links }) {
  if (!links.length) return null;
  return (
    <section className="border-b border-slate-200 py-5 last:border-b-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-blue-600" />{title}</h3>
      <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
        {links.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 py-3 text-sm text-blue-700 hover:text-blue-900"><span className="min-w-0 truncate">{link}</span><ExternalLink className="size-4 shrink-0" /></a>)}
      </div>
    </section>
  );
}

export function MediaReports() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = React.useState(null);
  const [selectedId, setSelectedId] = React.useState(null);
  const [showFilters, setShowFilters] = React.useState(() => FILTERS.some(([key]) => params.has(key)));
  const [q, setQ] = React.useState(params.get("q") || "");
  const page = Math.max(parseInt(params.get("page"), 10) || 1, 1);

  React.useEffect(() => setQ(params.get("q") || ""), [params]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => { if (q !== (params.get("q") || "")) setFilter("q", q.trim()); }, 300);
    return () => window.clearTimeout(timer);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const query = new URLSearchParams(params);
    query.set("page_size", PAGE_SIZE);
    getJSON(`/reports/media?${query}`).then(setData).catch((error) => toast.error(error.message || "Could not load media reports."));
  }, [params]);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setParams(next);
  }
  function setPage(nextPage) { const next = new URLSearchParams(params); next.set("page", nextPage); setParams(next); }
  function updateReview(reportId, status) {
    setData((current) => ({ ...current, rows: current.rows.map((row) => row.id === reportId ? { ...row, review_status: status } : row) }));
  }

  const activeFilters = FILTERS.filter(([key]) => params.get(key));
  const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Media reports" }]} />
      <div className="border-b border-slate-200 pb-6">
        <h2 className="text-3xl font-semibold text-slate-950">Media reports</h2>
        <p className="mt-2 text-sm text-slate-600">Review photos and media links submitted with individual crusade reports.</p>
      </div>

      <section aria-label="Search and filter media reports" className="border-y border-slate-200 bg-white">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(event) => setQ(event.target.value)} className="h-11 pl-9" placeholder="Search crusade, venue, city or report number..." aria-label="Search media reports" /></div>
          <Button type="button" variant="outline" className="h-11 justify-between sm:min-w-40" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters} aria-controls="media-report-filters">
            <span className="flex items-center gap-2"><SlidersHorizontal /> Filters</span>
            {activeFilters.length > 0 && <span className="grid size-5 place-items-center rounded-full bg-blue-600 text-[11px] text-white">{activeFilters.length}</span>}
            <ChevronDown className={`size-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </Button>
        </div>
        {showFilters && <div id="media-report-filters" className="grid gap-4 border-t border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-3 lg:grid-cols-5">
          {FILTERS.map(([key, label, kind, fixedOptions]) => (
            <Field key={key} label={label}>
              {kind === "date" ? <Input type="date" value={params.get(key) || ""} onChange={(event) => setFilter(key, event.target.value)} /> : (
                <Select value={params.get(key) || ""} onChange={(event) => setFilter(key, event.target.value)}>
                  <option value="">Any {label.toLowerCase()}</option>
                  {(kind === "fixed" ? fixedOptions : kind === "event-type"
                    ? (data?.filter_options?.event_type || []).map((value) => [value, typeLabel(value)])
                    : (data?.filter_options?.[key] || []).map((value) => [value, value]))
                    .map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}
                </Select>
              )}
            </Field>
          ))}
        </div>}
        {activeFilters.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3"><span className="mr-1 text-xs font-medium text-slate-500">Applied</span>{activeFilters.map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key, "")} className="flex items-center gap-1 rounded-full border bg-slate-100 px-2.5 py-1 text-xs font-medium hover:bg-blue-50">{label}: {params.get(key)} <X className="size-3" /></button>)}<button type="button" onClick={() => setParams({})} className="text-xs font-medium text-slate-500 hover:text-slate-900">Clear all</button></div>}
      </section>

      <section aria-label="Submitted media reports" className="border-y border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold">Submitted media</h3>{data && <p className="text-sm tabular-nums text-slate-500">{nfull.format(data.total)} matching</p>}</div>
        {!data ? <LoadingRows rows={8} /> : !data.rows.length ? <p className="py-16 text-center text-sm text-slate-500">No media reports match these filters.</p> : (
          <div className="divide-y divide-slate-200">
            {data.rows.map((report) => {
              const first = report.crusades[0];
              const hasPhotoLinks = extractLinks(report.photo_links).length > 0;
              const hasVideos = extractLinks(report.video_links).length > 0;
              return (
                <button key={report.id} type="button" onClick={() => setSelectedId(report.id)} className="grid w-full gap-4 px-4 py-4 text-left transition-colors hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h4 className="truncate text-sm font-semibold text-slate-950">{reportTitle(report)}</h4><ReviewBadge status={report.review_status} />{report.crusade_count > 1 && <Badge variant="outline">{report.crusade_count} crusades</Badge>}</div>
                    <p className="mt-2 truncate text-xs text-slate-500">Report {report.id} · {orgHierarchy(report)}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5 text-slate-400" />{displayDate(first?.event_date || report.created_at)}</span><span className="inline-flex items-center gap-1"><MapPin className="size-3.5 text-slate-400" />{[first?.city, first?.country || report.country].filter(Boolean).join(", ")}</span></div>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium text-slate-600">{report.photo_count > 0 && <span className="inline-flex items-center gap-1"><Image className="size-4 text-blue-600" />{report.photo_count} uploaded</span>}{hasPhotoLinks && <span>Photo links</span>}{hasVideos && <span className="inline-flex items-center gap-1"><Film className="size-4 text-violet-600" />Video links</span>}</div>
                </button>
              );
            })}
          </div>
        )}
      </section>
      {data && data.total > PAGE_SIZE && <Pagination page={page} totalPages={totalPages} onPage={setPage} />}
      {selectedId && <MediaReportDetail reportId={selectedId} onClose={() => setSelectedId(null)} onReviewChanged={updateReview} />}
    </div>
  );
}
