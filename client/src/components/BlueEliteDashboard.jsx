import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getJSON } from "@/lib/api";
import { BarH, nfull, orgHierarchy, typeLabel, Empty, StatTile } from "@/lib/dashboardWidgets";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

// Super-admin-only dashboard for Loveworld Blue Elite registrations.
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs items={[{ label: "Blue Elite", to: "/dashboard/blue-elite" }]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Loveworld Blue Elite — live</h2>
          <p className="text-sm text-muted-foreground">Crusade registrations logged by Blue Elite staff. Super-admin only.</p>
        </div>
        {data && <p className="text-sm text-muted-foreground">Updates every 15s</p>}
      </div>

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={KPI_TONES.planned}><StatTile label="Crusades planned" value={nfull.format(data.totals.planned)} /></div>
            <div className={KPI_TONES.registrations}><StatTile label="Registrations" value={nfull.format(data.totals.registrations)} /></div>
            <div className={KPI_TONES.zones}><StatTile label="Zones" value={nfull.format(data.totals.zones)} /></div>
            <div className={KPI_TONES.groups}><StatTile label="Groups" value={nfull.format(data.totals.groups)} /></div>
            <div className={KPI_TONES.churches}><StatTile label="Churches" value={nfull.format(data.totals.churches)} /></div>
            <div className={KPI_TONES.departments}><StatTile label="Departments" value={nfull.format(data.totals.departments)} /></div>
            <div className={KPI_TONES.countries}><StatTile label="Countries" value={nfull.format(data.totals.countries)} /></div>
            <div className={KPI_TONES.cities}><StatTile label="Cities" value={nfull.format(data.totals.cities)} /></div>
            <div className={KPI_TONES.expected_attendance}><StatTile label="Expected attendance" value={nfull.format(data.totals.expected_attendance)} /></div>
            <div className={KPI_TONES.confirmed}><StatTile label="Confirmed" value={nfull.format(data.totals.confirmed)} /></div>
            <div className={KPI_TONES.reported}><StatTile label="Reports submitted" value={nfull.format(data.totals.reported)} /></div>
            <div className={KPI_TONES.awaiting}><StatTile label="Awaiting reports" value={nfull.format(Math.max(data.totals.awaiting, 0))} /></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>By department</CardTitle><CardDescription>Crusades planned per Blue Elite department</CardDescription></CardHeader>
              <CardContent>
                {!data.by_department.length ? <Empty text="No departments logged yet." /> :
                  <BarH rows={data.by_department.map((row) => ({ key: row.key, label: row.key, value: row.planned || 0, sub: `${row.registrations || 0} reg` }))}
                    onRowClick={(row) => go("department", row.key)} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>By crusade type</CardTitle><CardDescription>Planned crusades by type</CardDescription></CardHeader>
              <CardContent>
                {!data.by_type.length ? <Empty text="No crusades yet." /> :
                  <BarH rows={bars(data.by_type, typeLabel)} onRowClick={(row) => go("event_type", row.key)} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>By zone</CardTitle><CardDescription>Planned crusades per zone</CardDescription></CardHeader>
              <CardContent>
                {!data.by_zone.length ? <Empty text="No zones yet." /> :
                  <BarH rows={bars(data.by_zone)} onRowClick={(row) => go("zone", row.key)} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>By country</CardTitle><CardDescription>Planned crusades per country</CardDescription></CardHeader>
              <CardContent>
                {!data.by_country.length ? <Empty text="No countries yet." /> :
                  <BarH rows={bars(data.by_country)} onRowClick={(row) => go("country", row.key)} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>By church</CardTitle><CardDescription>Planned crusades per church</CardDescription></CardHeader>
              <CardContent>
                {!data.by_church.length ? <Empty text="No churches yet." /> :
                  <BarH rows={bars(data.by_church)} onRowClick={(row) => go("church_name", row.key)} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Readiness</CardTitle><CardDescription>Status across all Blue Elite crusades</CardDescription></CardHeader>
              <CardContent>
                {!data.by_readiness.length ? <Empty text="No readiness data yet." /> :
                  <BarH rows={bars(data.by_readiness, (key) => READINESS_LABELS[key] || titleCase(key))}
                    onRowClick={(row) => go("readiness_status", row.key)} />}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>As they happen</CardTitle><CardDescription>Latest Blue Elite registrations</CardDescription></CardHeader>
            <CardContent>
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
        </>
      )}
    </div>
  );
}
