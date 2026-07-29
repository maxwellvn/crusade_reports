import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { GripVertical, X, Plus, Maximize2, Minimize2, RotateCcw, Search, FileDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton, LoadingRows } from "@/components/ui/skeleton";
import { getJSON, putJSON } from "@/lib/api";
import { WIDGETS, KPI_IDS, DEFAULT_LAYOUT, DRILL_MAP, Empty } from "@/lib/dashboardWidgets";

const LS_KEY = "crusades-dash-v1"; // first-paint cache only; the server row is the source of truth
const KPI_TONES = {
  salvations: "bg-emerald-50/80 [&_.stat-value]:!text-emerald-700",
  holy_spirit_filled: "bg-violet-50/80 [&_.stat-value]:!text-violet-700",
  water_baptisms: "bg-cyan-50/80 [&_.stat-value]:!text-cyan-700",
  registered_reported: "bg-green-50/80 [&_.stat-value]:!text-green-700",
  awaiting_reports: "bg-amber-50/90 [&_.stat-value]:!text-amber-700",
  registered: "bg-blue-50/80 [&_.stat-value]:!text-blue-700",
  registered_expected_attendance: "bg-indigo-50/80 [&_.stat-value]:!text-indigo-700",
  onsite_attendance: "bg-sky-50/80 [&_.stat-value]:!text-sky-700",
  online_attendance: "bg-cyan-50/80 [&_.stat-value]:!text-cyan-700",
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
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-2xl font-semibold tracking-tight text-slate-900">Reports dashboard</h2><p className="text-sm text-muted-foreground">Registration progress, reports and ministry outcomes at a glance.</p></div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button type="button" size="sm" onClick={() => navigate("/crusade-registration/register")}>
            <Plus /> Register crusades
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()} title="Export this dashboard as a PDF">
            <FileDown /> Export PDF
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

      {/* KPI slab — one card, cells divided by hairlines (gap-px over bg-border) */}
      {layout.some((w) => KPI_IDS.has(w.id)) && (
        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4">
          {layout.filter((w) => KPI_IDS.has(w.id)).map(({ id }) => (
            <div key={id} className={`group relative bg-card p-4 ${KPI_TONES[id] || "bg-slate-50/50"}`}
              onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(id)}>
              {id === "registered" || id === "registered_expected_attendance" ? (
                <button type="button" className="w-full text-left" onClick={() => goToRegistrations()}>{WIDGETS[id].render(stats)}</button>
              ) : id === "registered_reported" ? (
                <button type="button" className="w-full text-left" onClick={() => goToRegistrations({ report_status: "reported" })}>{WIDGETS[id].render(stats)}</button>
              ) : id === "awaiting_reports" ? (
                <button type="button" className="w-full text-left" onClick={() => goToRegistrations({ report_status: "unreported" })}>{WIDGETS[id].render(stats)}</button>
              ) : WIDGETS[id].render(stats)}
              <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 print:hidden">
                <span draggable className="cursor-grab p-1 text-muted-foreground/60 hover:text-muted-foreground active:cursor-grabbing"
                  title="Drag to rearrange" onDragStart={() => { dragId.current = id; }}>
                  <GripVertical className="size-3.5" />
                </span>
                <button type="button" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Remove widget" onClick={() => setLayout((l) => l.filter((x) => x.id !== id))}>
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {layout.filter((w) => !KPI_IDS.has(w.id)).map(({ id, expanded }) => {
          const w = WIDGETS[id];
          const drill = DRILL_MAP[id];
          const registrationFilter = w.registrationFilter;
          const wide = expanded || w.size === 2;
          return (
            <Card key={id} className={wide ? "sm:col-span-2" : ""}
              onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(id)}>
              <CardHeader className="flex-row items-center justify-between space-y-0 py-4">
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
              <CardContent>{w.render(stats, expanded,
                registrationFilter
                  ? (row) => goToRegistrations({ [registrationFilter]: row.key ?? row.label })
                  : drill ? (row) => goToCrusades(drill.filterField, row) : undefined
              )}</CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
