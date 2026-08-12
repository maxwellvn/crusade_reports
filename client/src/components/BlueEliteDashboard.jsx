import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getJSON } from "@/lib/api";
import { BarH, nfull, orgHierarchy, typeLabel, Empty, StatTile } from "@/lib/dashboardWidgets";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

// Permission-scoped dashboard for Loveworld Blue Elite registrations.
// Reads /api/blue-elite/registrations/live, which is server-scoped to
// program='blue_elite'. Deliberately simpler than the public live dashboard:
// KPI tiles + key breakdowns + a recent feed. No drag-and-drop layout.

const POLL_MS = 15000;
const READINESS_LABELS = {
  confirmed: "Confirmed", pending: "Pending confirmation", preparing: "Preparing", ready: "Ready",
  holding: "Holding as planned", not_holding: "Not holding",
};
const titleCase = (value) => value ? value[0].toUpperCase() + value.slice(1) : "—";
const bars = (rows, label = (value) => value) => (rows || []).map((row) => ({
  key: row.key, label: label(row.key), value: row.planned || 0, sub: `${row.registrations || 0} reg`,
}));

function timeAgo(sqliteUtc) {
  const s = Math.max(0, (Date.now() - new Date(sqliteUtc.replace(" ", "T") + "Z")) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const KPI_TONES = {
  planned: "bg-blue-50/80 [&_.stat-value]:!text-blue-700",
  registrations: "bg-violet-50/80 [&_.stat-value]:!text-violet-700",
  zones: "bg-fuchsia-50/80 [&_.stat-value]:!text-fuchsia-700",
  groups: "bg-purple-50/80 [&_.stat-value]:!text-purple-700",
  churches: "bg-pink-50/80 [&_.stat-value]:!text-pink-700",
  departments: "bg-rose-50/80 [&_.stat-value]:!text-rose-700",
  countries: "bg-indigo-50/80 [&_.stat-value]:!text-indigo-700",
  cities: "bg-sky-50/80 [&_.stat-value]:!text-sky-700",
  expected_attendance: "bg-cyan-50/80 [&_.stat-value]:!text-cyan-700",
  confirmed: "bg-teal-50/80 [&_.stat-value]:!text-teal-700",
  reported: "bg-green-50/80 [&_.stat-value]:!text-green-700",
  awaiting: "bg-amber-50/90 [&_.stat-value]:!text-amber-700",
};

export function BlueEliteDashboard() {
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    let failed = false;
    const load = () => getJSON("/blue-elite/registrations/live").then(setData).catch(() => {
      if (!failed) { failed = true; toast.error("Could not load Blue Elite live data"); }
    });
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const go = (key, value) => navigate(`/registrations/blue-elite?${key}=${encodeURIComponent(value)}`);

  const KPI_ROWS = data ? [
    { id: "planned", label: "Crusades planned", value: data.totals.planned },
    { id: "registrations", label: "Registrations", value: data.totals.registrations },
    { id: "zones", label: "Zones", value: data.totals.zones },
    { id: "groups", label: "Groups", value: data.totals.groups },
    { id: "churches", label: "Churches", value: data.totals.churches },
    { id: "departments", label: "Departments", value: data.totals.departments },
    { id: "countries", label: "Countries", value: data.totals.countries },
    { id: "cities", label: "Cities", value: data.totals.cities },
    { id: "expected_attendance", label: "Expected attendance", value: data.totals.expected_attendance },
    { id: "confirmed", label: "Confirmed", value: data.totals.confirmed },
    { id: "reported", label: "Reports submitted", value: data.totals.reported },
    { id: "awaiting", label: "Awaiting reports", value: Math.max(data.totals.awaiting, 0) },
  ] : [];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Breadcrumbs items={[{ label: "Blue Elite", to: "/dashboard/blue-elite" }]} />
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">Loveworld Blue Elite — live</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Crusade registrations logged by Blue Elite staff.</p>
        </div>
        {data && <p className="text-sm tabular-nums text-slate-500">Updates every 15s</p>}
      </div>

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          {/* Blue Elite pulse — one continuous instrument panel, not a field of KPI cards. */}
          <section aria-labelledby="blue-elite-pulse-heading" className="overflow-hidden border-y border-blue-200 bg-white shadow-[0_18px_45px_-34px_rgba(37,99,235,0.35)] print:border-slate-300 print:shadow-none">
            <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/70 px-5 py-3">
              <h3 id="blue-elite-pulse-heading" className="text-xs font-semibold text-blue-900">Blue Elite pulse</h3>
              <p className="text-xs text-slate-500">Live planning totals</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4">
              {KPI_ROWS.map(({ id, label, value }, index) => (
                <div key={id} className={`group relative min-h-32 border-blue-100 p-5 [&_.text-muted-foreground]:!text-slate-500 ${KPI_TONES[id] || "bg-white [&_.stat-value]:!text-blue-700"} ${index % 2 ? "border-l" : ""} ${index >= 2 ? "border-t" : ""} ${index >= 4 ? "lg:border-t" : "lg:border-t-0"} ${index % 4 ? "lg:border-l" : "lg:border-l-0"}`}>
                  <button type="button" className="w-full text-left" onClick={() => go("q", "")}>
                    <StatTile label={label} value={nfull.format(value)} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="blue-elite-breakdowns-heading" className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h3 id="blue-elite-breakdowns-heading" className="text-lg font-semibold text-slate-950">Registration breakdowns</h3>
                <p className="mt-1 text-sm text-slate-500">Select a row to open matching registrations.</p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Card className="rounded-none border-x-0 border-slate-200 shadow-none sm:col-span-2">
                <CardHeader className="space-y-0 bg-slate-50/70 px-4 py-3"><CardTitle className="text-sm">By department</CardTitle><CardDescription className="text-xs">Crusades planned per Blue Elite department</CardDescription></CardHeader>
                <CardContent className="px-4 py-5">
                  {!data.by_department.length ? <Empty text="No departments logged yet." /> :
                    <BarH rows={data.by_department.map((row) => ({ key: row.key, label: row.key, value: row.planned || 0, sub: `${row.registrations || 0} reg` }))}
                      onRowClick={(row) => go("department", row.key)} />}
                </CardContent>
              </Card>
              <Card className="rounded-none border-x-0 border-slate-200 shadow-none">
                <CardHeader className="space-y-0 bg-slate-50/70 px-4 py-3"><CardTitle className="text-sm">By crusade type</CardTitle><CardDescription className="text-xs">Planned crusades by type</CardDescription></CardHeader>
                <CardContent className="px-4 py-5">
                  {!data.by_type.length ? <Empty text="No crusades yet." /> :
                    <BarH rows={bars(data.by_type, typeLabel)} onRowClick={(row) => go("event_type", row.key)} />}
                </CardContent>
              </Card>
              <Card className="rounded-none border-x-0 border-slate-200 shadow-none">
                <CardHeader className="space-y-0 bg-slate-50/70 px-4 py-3"><CardTitle className="text-sm">By zone</CardTitle><CardDescription className="text-xs">Planned crusades per zone</CardDescription></CardHeader>
                <CardContent className="px-4 py-5">
                  {!data.by_zone.length ? <Empty text="No zones yet." /> :
                    <BarH rows={bars(data.by_zone)} onRowClick={(row) => go("zone", row.key)} />}
                </CardContent>
              </Card>
              <Card className="rounded-none border-x-0 border-slate-200 shadow-none">
                <CardHeader className="space-y-0 bg-slate-50/70 px-4 py-3"><CardTitle className="text-sm">By country</CardTitle><CardDescription className="text-xs">Planned crusades per country</CardDescription></CardHeader>
                <CardContent className="px-4 py-5">
                  {!data.by_country.length ? <Empty text="No countries yet." /> :
                    <BarH rows={bars(data.by_country)} onRowClick={(row) => go("country", row.key)} />}
                </CardContent>
              </Card>
              <Card className="rounded-none border-x-0 border-slate-200 shadow-none">
                <CardHeader className="space-y-0 bg-slate-50/70 px-4 py-3"><CardTitle className="text-sm">By church</CardTitle><CardDescription className="text-xs">Planned crusades per church</CardDescription></CardHeader>
                <CardContent className="px-4 py-5">
                  {!data.by_church.length ? <Empty text="No churches yet." /> :
                    <BarH rows={bars(data.by_church)} onRowClick={(row) => go("church_name", row.key)} />}
                </CardContent>
              </Card>
              <Card className="rounded-none border-x-0 border-slate-200 shadow-none">
                <CardHeader className="space-y-0 bg-slate-50/70 px-4 py-3"><CardTitle className="text-sm">Readiness</CardTitle><CardDescription className="text-xs">Status across all Blue Elite crusades</CardDescription></CardHeader>
                <CardContent className="px-4 py-5">
                  {!data.by_readiness.length ? <Empty text="No readiness data yet." /> :
                    <BarH rows={bars(data.by_readiness, (key) => READINESS_LABELS[key] || titleCase(key))}
                      onRowClick={(row) => go("readiness_status", row.key)} />}
                </CardContent>
              </Card>
              <Card className="rounded-none border-x-0 border-slate-200 shadow-none sm:col-span-2">
                <CardHeader className="space-y-0 bg-slate-50/70 px-4 py-3"><CardTitle className="text-sm">As they happen</CardTitle><CardDescription className="text-xs">Latest Blue Elite registrations</CardDescription></CardHeader>
                <CardContent className="px-4 py-5">
                  {!data.recent.length ? <Empty text="No registrations yet — they’ll appear here live." /> : (
                    <ul className="divide-y">
                      {data.recent.map((row) => (
                        <li key={row.id} onClick={() => go("q", row.org)} className="flex cursor-pointer items-baseline justify-between gap-3 py-2.5 hover:bg-accent/50">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{orgHierarchy(row)}</p>
                            <p className="text-xs text-muted-foreground">{row.department ? `${row.department} · ` : ""}{row.country} · plan date {row.plan_date}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums">{nfull.format(row.planned)}</p>
                            <p className="text-xs text-muted-foreground">{timeAgo(row.created_at)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
