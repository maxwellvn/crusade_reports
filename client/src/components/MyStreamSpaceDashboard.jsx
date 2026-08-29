import * as React from "react";
import { Radio, UsersRound } from "lucide-react";

import { getJSON } from "@/lib/api";
import { nfull } from "@/lib/dashboardWidgets";
import { Skeleton } from "@/components/ui/skeleton";

function TotalCard({ icon: Icon, label, value, tone }) {
  return (
    <article className="border-y border-slate-200 bg-white px-6 py-9 shadow-[0_20px_50px_-42px_rgba(15,23,42,0.5)] sm:px-10 sm:py-12">
      <div className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] ${tone}`}>
        <Icon className="size-5" aria-hidden="true" />
        <h2>{label}</h2>
      </div>
      <p className="mt-4 break-words text-4xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-6xl">
        {nfull.format(value)}
      </p>
    </article>
  );
}

export function MyStreamSpaceDashboard() {
  const [data, setData] = React.useState(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    getJSON("/mystreamspace").then(setData).catch(() => setFailed(true));
  }, []);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-blue-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-5 sm:px-8">
          <img src="/logo.png" alt="Night of a Thousand Crusades" className="h-12 w-auto" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Night of a Thousand Crusades</p>
            <p className="mt-1 text-sm text-slate-500">Nations &amp; Continents Edition</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-700">Live campaign totals</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-6xl">NOTC MyStreamSpace Dashboard</h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">Online crusades conducted through MyStreamSpace.</p>
        </div>

        {failed ? (
          <div className="mt-12 border-y border-rose-200 bg-rose-50 px-6 py-8 text-sm text-rose-800">
            MyStreamSpace totals are temporarily unavailable. Please try again shortly.
          </div>
        ) : !data ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2" role="status" aria-label="Loading MyStreamSpace totals">
            <Skeleton className="h-48 rounded-none" />
            <Skeleton className="h-48 rounded-none" />
          </div>
        ) : (
          <section className="mt-12 grid gap-6 sm:grid-cols-2" aria-label="MyStreamSpace totals">
            <TotalCard icon={Radio} label="Total crusades" value={data.totals.crusades} tone="text-blue-700" />
            <TotalCard icon={UsersRound} label="Total online attendance" value={data.totals.online_attendance} tone="text-fuchsia-700" />
          </section>
        )}
      </div>
    </main>
  );
}
