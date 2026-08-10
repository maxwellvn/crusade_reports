import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GripVertical, X, Plus, Maximize2, Minimize2, RotateCcw, Search, Printer } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton, LoadingRows } from "@/components/ui/skeleton";
import { getJSON, putJSON } from "@/lib/api";
import { WIDGETS, KPI_IDS, DEFAULT_LAYOUT, DRILL_MAP, Empty } from "@/lib/dashboardWidgets";

const LS_KEY = "crusades-dash-v1"; // first-paint cache only; the server row is the source of truth
const KPI_TONES = {
  reports: "bg-slate-50 [&_.stat-value]:!text-slate-800",
  crusades: "bg-blue-50/65 [&_.stat-value]:!text-blue-700",
  physical_crusades: "bg-sky-50/70 [&_.stat-value]:!text-sky-700",
  online_crusades: "bg-cyan-50/70 [&_.stat-value]:!text-cyan-700",
  countries_covered: "bg-emerald-50/70 [&_.stat-value]:!text-emerald-700",
  registered: "bg-indigo-50/65 [&_.stat-value]:!text-indigo-700",
  registered_reported: "bg-emerald-50/70 [&_.stat-value]:!text-emerald-700",
  awaiting_reports: "bg-amber-50/75 [&_.stat-value]:!text-amber-700",
  registered_expected_attendance: "bg-violet-50/65 [&_.stat-value]:!text-violet-700",
  onsite_attendance: "bg-sky-50/70 [&_.stat-value]:!text-sky-700",
  online_attendance: "bg-cyan-50/70 [&_.stat-value]:!text-cyan-700",
  salvations: "bg-rose-50/65 [&_.stat-value]:!text-rose-700",
  holy_spirit_filled: "bg-purple-50/65 [&_.stat-value]:!text-purple-700",
  water_baptisms: "bg-teal-50/70 [&_.stat-value]:!text-teal-700",
  ror_distributed: "bg-orange-50/70 [&_.stat-value]:!text-orange-700",
  bibles_distributed: "bg-yellow-50/75 [&_.stat-value]:!text-yellow-700",
  radio_tv_reach: "bg-fuchsia-50/65 [&_.stat-value]:!text-fuchsia-700",
  testimonies_recorded: "bg-pink-50/70 [&_.stat-value]:!text-pink-700",
  tap2read_distributed: "bg-lime-50/70 [&_.stat-value]:!text-lime-700",
  ntyba_distributed: "bg-violet-50/65 [&_.stat-value]:!text-violet-700",
  healing_nations_magazine: "bg-red-50/60 [&_.stat-value]:!text-red-700",
};
// ---- Dashboard shell: add / remove / drag-reorder / expand ------------------
// Layout (which widgets show, in what order) is saved to the server, not just
// this browser — so building the dashboard here IS the admin configuration.

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = React.useState(null);
  const [error, setError] = React.useState(false);
  const [layout, setLayout] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY));
      if (Array.isArray(saved) && saved.every((w) => WIDGETS[w.id])) return saved;
    } catch { /* fall through to default */ }
    return DEFAULT_LAYOUT;
  });
  const loadedFromServer = React.useRef(false);
  const dragId = React.useRef(null);

  React.useEffect(() => {
    getJSON("/stats").then(setStats).catch(() => { setError(true); toast.error("Could not load stats"); });
    getJSON("/dashboard-layout").then(({ layout: saved }) => {
      loadedFromServer.current = true;
      if (Array.isArray(saved) && saved.length) setLayout(saved.filter((w) => WIDGETS[w.id]));
    }).catch(() => { loadedFromServer.current = true; });
  }, []);

  React.useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(layout));
    if (!loadedFromServer.current) return; // don't clobber the server row with the pre-load default
    putJSON("/dashboard-layout", { layout }).catch(() => toast.error("Could not save dashboard layout"));
  }, [layout]);

  const hidden = Object.keys(WIDGETS).filter((id) => !layout.some((w) => w.id === id));
  const patch = (id, p) => setLayout((l) => l.map((w) => (w.id === id ? { ...w, ...p } : w)));

  function dropOn(targetId) {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    setLayout((l) => {
      const next = l.filter((w) => w.id !== from);
      next.splice(next.findIndex((w) => w.id === targetId), 0, l.find((w) => w.id === from));
      return next;
    });
  }

  function goToCrusades(field, row) {
    navigate(`/crusades?${field}=${encodeURIComponent(row.key ?? row.label)}`);
  }

  function goToRegistrations(filters = {}) {
    navigate(`/registrations?${new URLSearchParams(filters).toString()}`);
  }

  if (error) return <Empty text="Stats are unavailable right now — try again shortly." />;
  if (!stats)
    return (
      <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2" role="status" aria-label="Loading stats">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}>
            <CardHeader className="py-4"><Skeleton className="h-4 w-32" /></CardHeader>
            <CardContent><LoadingRows rows={4} className="py-0" /></CardContent>
          </Card>
        ))}
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl"><h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">Reports dashboard</h2><p className="mt-2 text-sm leading-6 text-slate-600">Registration progress, completed reports and ministry outcomes in one operational view.</p></div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button type="button" size="sm" onClick={() => navigate("/crusade-registration/register")}>
            <Plus /> Register crusades
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()} title="Open the print dialog for this dashboard">
            <Printer /> Print dashboard
          </Button>
          {/* Global search: lands on /crusades backed by FTS5 across every field */}
          <form className="relative hidden sm:block"
            onSubmit={(e) => { e.preventDefault(); const v = e.target.q.value.trim(); if (v) navigate(`/crusades?q=${encodeURIComponent(v)}`); }}>
            <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input name="q" placeholder="Search crusades…" aria-label="Search crusades"
              className="w-56 border-b border-input bg-transparent py-1.5 pl-6 text-sm placeholder:text-muted-foreground focus:border-foreground focus:outline-none" />
          </form>
          {hidden.length > 0 && (
            <details className="relative">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent [&::-webkit-details-marker]:hidden">
                <Plus className="size-4" /> Add widget
              </summary>
              <div className="absolute right-0 z-20 mt-1 max-h-80 w-64 overflow-y-auto rounded-md border bg-popover p-1">
                {hidden.map((id) => (
                  <button key={id} type="button"
                    className="w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    onClick={(e) => { setLayout((l) => [...l, { id, expanded: false }]); e.target.closest("details").open = false; }}>
                    {WIDGETS[id].title}
                  </button>
                ))}
              </div>
            </details>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setLayout(DEFAULT_LAYOUT)} title="Reset layout">
            <RotateCcw /> Reset
          </Button>
        </div>
      </div>

      {/* Campaign pulse — one continuous instrument panel, not a field of KPI cards. */}
      {layout.some((w) => KPI_IDS.has(w.id)) && (
        <section aria-labelledby="campaign-pulse-heading" className="overflow-hidden border-y border-blue-200 bg-white shadow-[0_18px_45px_-34px_rgba(37,99,235,0.35)] print:border-slate-300 print:shadow-none">
          <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/70 px-5 py-3">
            <h3 id="campaign-pulse-heading" className="text-xs font-semibold text-blue-900">Campaign pulse</h3>
            <p className="text-xs text-slate-500">Live totals from registrations and reports</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4">
          {layout.filter((w) => KPI_IDS.has(w.id)).map(({ id }, index) => (
            <div key={id} className={`group relative min-h-32 border-blue-100 p-5 [&_.text-muted-foreground]:!text-slate-500 ${KPI_TONES[id] || "bg-white [&_.stat-value]:!text-blue-700"} ${index % 2 ? "border-l" : ""} ${index >= 2 ? "border-t" : ""} ${index >= 4 ? "lg:border-t" : "lg:border-t-0"} ${index % 4 ? "lg:border-l" : "lg:border-l-0"}`}
              onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(id)}>
              {id === "registered" || id === "registered_expected_attendance" ? (
                <button type="button" className="w-full text-left" onClick={() => goToRegistrations()}>{WIDGETS[id].render(stats)}</button>
              ) : id === "registered_reported" ? (
                <button type="button" className="w-full text-left" onClick={() => goToRegistrations({ report_status: "reported" })}>{WIDGETS[id].render(stats)}</button>
              ) : id === "awaiting_reports" ? (
                <button type="button" className="w-full text-left" onClick={() => goToRegistrations({ report_status: "unreported" })}>{WIDGETS[id].render(stats)}</button>
              ) : WIDGETS[id].render(stats)}
              <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 print:hidden">
                <span draggable className="cursor-grab p-1 text-slate-400 hover:text-slate-700 active:cursor-grabbing"
                  title="Drag to rearrange" onDragStart={() => { dragId.current = id; }}>
                  <GripVertical className="size-3.5" />
                </span>
                <button type="button" className="rounded-md p-1 text-slate-400 transition-colors hover:bg-blue-50 hover:text-slate-700"
                  title="Remove widget" onClick={() => setLayout((l) => l.filter((x) => x.id !== id))}>
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
          </div>
        </section>
      )}

      <section aria-labelledby="breakdowns-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div><h3 id="breakdowns-heading" className="text-lg font-semibold text-slate-950">Operational breakdowns</h3><p className="mt-1 text-sm text-slate-500">Select any row to inspect the underlying records.</p></div>
          <span className="text-xs tabular-nums text-slate-500">{layout.filter((w) => !KPI_IDS.has(w.id)).length} visible</span>
        </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {layout.filter((w) => !KPI_IDS.has(w.id)).map(({ id, expanded }) => {
          const w = WIDGETS[id];
          const drill = DRILL_MAP[id];
          const registrationFilter = w.registrationFilter;
          const wide = expanded || w.size === 2;
          return (
            <Card key={id} className={`rounded-none border-x-0 border-slate-200 shadow-none ${wide ? "sm:col-span-2" : ""}`}
              onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(id)}>
              <CardHeader className="flex-row items-center justify-between space-y-0 bg-slate-50/70 px-4 py-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span draggable className="cursor-grab text-muted-foreground/60 transition-colors hover:text-muted-foreground active:cursor-grabbing print:hidden"
                    title="Drag to rearrange" onDragStart={() => { dragId.current = id; }}>
                    <GripVertical className="size-4" />
                  </span>
                  <CardTitle className="truncate text-sm">{w.title}</CardTitle>
                </div>
                <div className="flex shrink-0 gap-0.5 text-muted-foreground print:hidden">
                  {w.size !== 2 && (
                    <button type="button" className="rounded-md p-1.5 transition-colors hover:bg-accent hover:text-foreground"
                      title={drill ? "Open full breakdown" : expanded ? "Collapse" : "Expand"}
                      onClick={() => (drill ? navigate(`/dashboard/widget/${id}`) : patch(id, { expanded: !expanded }))}>
                      {expanded && !drill ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                    </button>
                  )}
                  <button type="button" className="rounded-md p-1.5 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title="Remove widget" onClick={() => setLayout((l) => l.filter((x) => x.id !== id))}>
                    <X className="size-3.5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="px-4 py-5">{w.render(stats, expanded,
                registrationFilter
                  ? (row) => goToRegistrations({ [registrationFilter]: row.key ?? row.label })
                  : drill ? (row) => goToCrusades(drill.filterField, row) : undefined
              )}</CardContent>
            </Card>
          );
        })}
      </div>
      </section>
    </div>
  );
}
