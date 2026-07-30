import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, ArrowUpRight, BookOpen, Check, FileText, Headphones, Image, Link2, Search, Video, X } from "lucide-react";
import { getJSON } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const TYPES = [
  ["all", "All resources"], ["document", "Documents"], ["image", "Images"],
  ["video", "Videos"], ["audio", "Audio"], ["link", "Links"], ["other", "Other"],
];
const ICONS = { document: FileText, image: Image, video: Video, audio: Headphones, link: Link2, other: BookOpen };

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function ResourcePreview({ resource, Icon }) {
  const [thumbnailFailed, setThumbnailFailed] = React.useState(false);
  if (resource.thumbnail_url && !thumbnailFailed) return <img src={resource.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setThumbnailFailed(true)} className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]" />;
  if (resource.resource_type === "image") return <img src={resource.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]" />;
  if (resource.resource_type === "video") return <video src={resource.url} preload="metadata" muted className="h-full w-full object-cover" />;
  return <Icon className="size-10 text-slate-500" strokeWidth={1.4} />;
}

function ResourceRow({ resource }) {
  const Icon = ICONS[resource.resource_type] || BookOpen;
  const action = resource.is_external ? "Visit link" : "Open resource";
  return (
    <article className="group grid gap-5 border-t border-slate-200 py-6 first:border-t-0 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-8 sm:py-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <a href={resource.url} target="_blank" rel="noreferrer" aria-label={`Open ${resource.title}`} className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-lg bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4">
        <ResourcePreview resource={resource} Icon={Icon} />
      </a>
      <div className="flex min-w-0 flex-col py-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="font-semibold text-slate-900">{resource.category}</span>
          <span aria-hidden="true">/</span>
          <span className="capitalize">{resource.resource_type}</span>
          {resource.file_size ? <><span aria-hidden="true">/</span><span>{formatSize(resource.file_size)}</span></> : null}
        </div>
        <h2 className="mt-3 text-xl font-medium leading-tight tracking-[-0.02em] text-slate-950 sm:text-2xl"><a href={resource.url} target="_blank" rel="noreferrer" className="underline decoration-transparent underline-offset-4 transition-colors hover:decoration-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4">{resource.title}</a></h2>
        {resource.description && <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">{resource.description}</p>}
        {resource.resource_type === "audio" && <audio controls preload="none" src={resource.url} className="mt-5 h-10 w-full max-w-xl" />}
        <a href={resource.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex w-fit items-center gap-2 text-sm font-semibold text-slate-950 underline decoration-slate-300 underline-offset-4 transition-colors hover:decoration-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4">
          {action}
          {resource.is_external ? <ArrowUpRight className="size-4" /> : <ArrowDownToLine className="size-4" />}
        </a>
      </div>
    </article>
  );
}

export function ResourcesLibrary() {
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [data, setData] = React.useState({ resources: [], categories: [] });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const hasFilters = Boolean(query || type !== "all" || category !== "all");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (type !== "all") params.set("type", type);
      if (category !== "all") params.set("category", category);
      getJSON(`/resources?${params}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [query, type, category]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4"><img src="/logo.png" alt="" className="h-10 w-auto" /><span className="hidden truncate text-sm font-semibold sm:block">Approved Resources Hub</span></Link>
          <Link to="/" className="ml-auto text-sm font-semibold text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4">Return home</Link>
        </div>
      </header>
      <main className="bg-white">
        <section className="border-b border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
            <p className="text-sm font-semibold text-blue-700">Night of a Thousand Crusades (NOTC)</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-normal leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-6xl">Approved Resources Hub</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">Access all approved resources required for effective preparation, teaching, outreach, and crusade execution.</p>
            <ul className="mt-8 grid max-w-4xl gap-x-10 gap-y-3 border-y border-slate-200 py-6 text-sm text-slate-700 sm:grid-cols-2">{["Approved teaching materials", "Outreach resources", "Crusade guides and operational documents", "Campaign media assets", "Approved songs and videos", "Promotional materials", "Official NOTC links and resources", "Other approved resources"].map((item) => <li key={item} className="flex items-start gap-3"><Check className="mt-0.5 size-4 shrink-0 text-blue-700" /><span>{item}</span></li>)}</ul>
            <p className="mt-8 max-w-3xl border-l-2 border-blue-600 pl-4 text-sm font-medium leading-6 text-slate-700">All teams are encouraged to access and utilise only approved resources from this platform to ensure consistency, excellence, and alignment across all nations.</p>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="grid border-y border-slate-200 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <label className="relative flex items-center border-b border-slate-200 lg:border-b-0 lg:border-r"><span className="sr-only">Search resources</span><Search className="absolute left-0 size-5 text-slate-500" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search approved resources" className="h-14 rounded-none border-0 bg-transparent pl-8 pr-10 text-base shadow-none focus-visible:ring-0" />{query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 grid size-10 place-items-center text-slate-500 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label="Clear search"><X className="size-4" /></button>}</label>
            <Select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-14 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 lg:pl-5"><option value="all">Every category</option>{data.categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</Select>
          </div>
          <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Resource type" role="tablist">{TYPES.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={type === value} onClick={() => setType(value)} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${type === value ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{label}</button>)}</div>
          <div className="flex min-h-14 items-center justify-between gap-4"><p className="text-sm text-slate-500" aria-live="polite">{loading ? "Searching…" : `${data.resources.length} resource${data.resources.length === 1 ? "" : "s"}`}</p>{hasFilters && <button className="text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-950 hover:decoration-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4" onClick={() => { setQuery(""); setType("all"); setCategory("all"); }}>Reset filters</button>}</div>
          {error && <div role="alert" className="border-y border-red-300 py-4 text-sm text-red-800">The library could not be loaded. Check your connection and try again.</div>}
          {loading ? <div className="border-t border-slate-200 py-6"><div className="grid gap-5 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-8"><Skeleton className="aspect-[16/10] rounded-lg" /><div className="space-y-3 py-2"><Skeleton className="h-3 w-36" /><Skeleton className="h-7 w-3/4" /><Skeleton className="h-4 w-full max-w-xl" /><Skeleton className="h-4 w-2/3" /></div></div></div> : data.resources.length ? (
            <div>{data.resources.map((r) => <ResourceRow key={r.id} resource={r} />)}</div>
          ) : <div className="border-t border-slate-200 py-16 sm:py-24"><h2 className="text-2xl font-medium tracking-[-0.02em] text-slate-950">{hasFilters ? "No matching resources" : "The hub is being prepared"}</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{hasFilters ? "Change the search term or reset the filters to see the full hub." : "Approved NOTC resources will appear here as they are published."}</p>{hasFilters && <button className="mt-5 text-sm font-semibold text-slate-950 underline decoration-slate-300 underline-offset-4" onClick={() => { setQuery(""); setType("all"); setCategory("all"); }}>Show all resources</button>}</div>}
        </section>
      </main>
    </div>
  );
}
