import * as React from "react";
import { toast } from "sonner";
import { Radio } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton, LoadingRows } from "@/components/ui/skeleton";
import { getJSON } from "@/lib/api";
import { GeoMap, BarH, nfull, typeLabel, Empty, StatSlab } from "@/lib/dashboardWidgets";

// Live registration dashboard: polls /registrations/live every 10s — the map,
// tallies and feed move as zones/groups/churches/networks register.
// ponytail: polling, not SSE — at a 10s cadence nobody can tell the difference.

const POLL_MS = 10000;

function timeAgo(sqliteUtc) {
  const s = Math.max(0, (Date.now() - new Date(sqliteUtc.replace(" ", "T") + "Z")) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function RegistrationsLive() {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let failed = false;
    const load = () => getJSON("/registrations/live").then(setData).catch(() => {
      if (!failed) { failed = true; toast.error("Could not load live registrations"); }
    });
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);

  if (!data)
    return (
      <div className="mx-auto max-w-5xl space-y-4" role="status" aria-label="Loading">
        <Skeleton className="h-24" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card><CardContent className="pt-6"><LoadingRows rows={5} /></CardContent></Card>
          <Card><CardContent className="pt-6"><LoadingRows rows={5} /></CardContent></Card>
        </div>
      </div>
    );

  const { totals, by_type, by_country, geo, recent } = data;
  // GeoMap speaks "reach"; for registrations reach = planned crusades.
  const mapRows = by_country.map((r) => ({ key: r.key, attendance: r.planned, crusades: r.registrations }));
  const mapCities = geo.map((c) => ({ key: c.key, country: c.country, lat: c.lat, lng: c.lng, attendance: c.planned, crusades: c.planned }));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Live registrations</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Radio className="size-3.5 animate-pulse" /> updates every 10s
        </span>
      </div>

      <StatSlab stats={[
        ["Crusades planned", totals.planned],
        ["Organizations registered", totals.registrations],
        ["Countries", totals.countries],
        ["Crusade types", totals.types],
      ]} />

      {/* Coverage map */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Coverage</CardTitle>
          <CardDescription>Where crusades are being registered — switch to Heat for coverage intensity.</CardDescription>
        </CardHeader>
        <CardContent>
          <GeoMap rows={mapRows} cities={mapCities} emptyText="The map lights up as soon as the first crusades are registered." />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Live feed */}
        <Card>
          <CardHeader><CardTitle className="text-sm">As they happen</CardTitle></CardHeader>
          <CardContent>
            {!recent.length ? <Empty text="No registrations yet — they’ll appear here live." /> : (
              <ul className="divide-y">
                {recent.map((r, i) => (
                  <li key={r.id} className={`flex items-baseline justify-between gap-3 py-2.5 ${i === 0 ? "animate-step-in motion-reduce:animate-none" : ""}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium capitalize">{r.org}</p>
                      <p className="text-xs text-muted-foreground">{r.country} · plan date {r.plan_date}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">{nfull.format(r.planned)}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* By type */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Planned by crusade type</CardTitle></CardHeader>
          <CardContent>
            <BarH rows={by_type.map((r) => ({ label: typeLabel(r.key), value: r.planned, sub: `${r.registrations} reg` }))} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
