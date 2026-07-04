import * as React from "react";
import { useParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { LoadingRows } from "@/components/ui/skeleton";
import { getJSON } from "@/lib/api";
import { nfull, typeLabel, StatSlab } from "@/lib/dashboardWidgets";

// Zone dashboard, opened via a capability link (/zone/<token>). Read-only;
// the server scopes every row to the token's zone.

export function ZonePortal() {
  const { token } = useParams();
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);

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

  // items grouped per registration → "600 Mega · 400 Street (Lagos)"
  const itemsByReg = {};
  (data?.items || []).forEach((it) => {
    (itemsByReg[it.registration_id] ||= []).push(
      `${nfull.format(it.planned_count)} ${typeLabel(it.event_type)}${it.city ? ` (${it.city})` : ""}`
    );
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
          <img src="/logo.png" alt="" className="h-11 w-auto shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">{data ? data.zone : "Zone dashboard"}</h1>
            <p className="hidden truncate text-sm text-muted-foreground sm:block">Your {data?.kind === "network" ? "network" : "zone"}’s crusade registrations and reports.</p>
          </div>
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
              <CardHeader>
                <CardTitle className="text-sm">Registrations</CardTitle>
                <CardDescription>Every registration made under {data.zone}.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {!data.registrations.length ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No registrations yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Registered</th>
                        <th className="py-2 pr-3 font-medium">By</th>
                        <th className="py-2 pr-3 font-medium">Plan date</th>
                        <th className="py-2 pr-3 font-medium">Breakdown</th>
                        <th className="py-2 text-right font-medium">Planned</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {data.registrations.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap">{r.created_at.slice(0, 10)}</td>
                          <td className="max-w-48 truncate py-2 pr-3 capitalize">{r.church_name || r.group_name || r.organization_type}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{r.plan_date}</td>
                          <td className="max-w-72 truncate py-2 pr-3 text-muted-foreground">{(itemsByReg[r.id] || []).join(" · ")}</td>
                          <td className="py-2 text-right font-medium">{nfull.format(r.planned)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Crusades reported</CardTitle>
                <CardDescription>Outcomes submitted by {data.zone}.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {!data.crusades.length ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No reports yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Date</th>
                        <th className="py-2 pr-3 font-medium">Event</th>
                        <th className="py-2 pr-3 font-medium">Type</th>
                        <th className="py-2 pr-3 font-medium">City</th>
                        <th className="py-2 pr-3 text-right font-medium">Attendance</th>
                        <th className="py-2 text-right font-medium">Souls won</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {data.crusades.map((c) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap">{c.event_date}</td>
                          <td className="max-w-44 truncate py-2 pr-3">{c.event_name}</td>
                          <td className="py-2 pr-3">{c.event_type === "other" ? c.other_event_type : typeLabel(c.event_type)}</td>
                          <td className="max-w-40 truncate py-2 pr-3">{c.city}</td>
                          <td className="py-2 pr-3 text-right">{nfull.format((c.attendance || 0) + (c.online_participation || 0))}</td>
                          <td className="py-2 text-right">{nfull.format(c.salvation || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
