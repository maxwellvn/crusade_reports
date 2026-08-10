import * as React from "react";
import { Copy, Download, FileText, Globe, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { getJSON } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingRows } from "@/components/ui/skeleton";
import { BarH, nfull } from "@/lib/dashboardWidgets";
import { downloadNotcReportDocx } from "@/lib/printReportPdf";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat();

function breakdownGroups(gpdZones, cellCrusades, networks) {
  return [
    {
      label: "GPD Zones",
      countries: gpdZones.countryCount,
      crusades: gpdZones.totalCrusades,
      registrations: gpdZones.totalRegistrations,
    },
    {
      label: "Cell Crusades",
      countries: cellCrusades.countryCount,
      crusades: cellCrusades.totalCrusades,
      registrations: cellCrusades.totalRegistrations,
    },
    ...networks.map((n) => ({
      label: n.network,
      countries: n.countries.length,
      crusades: n.totalCrusades,
      registrations: n.totalRegistrations,
    })),
  ];
}

function countryBars(countries) {
  return (countries || []).map((row) => ({
    key: row.country,
    label: row.country,
    value: row.crusades || 0,
    sub: `${nfull.format(row.registrations || 0)} regs`,
  }));
}

function exportCountryCoverageWord(data) {
  const { summary, unregisteredByContinent, gpdZones, cellCrusades, networks } = data;
  const groups = breakdownGroups(gpdZones, cellCrusades, networks);
  const date = new Date().toISOString().slice(0, 10);

  downloadNotcReportDocx({
    filename: `country-coverage-breakdown-${date}.docx`,
    eyebrow: "Night of a Thousand Crusades",
    title: "Country Coverage Analysis",
    meta: "From the Country coverage page. Includes GPD Zones, Cell Crusades, networks, and countries without registrations.",
    summary: [
      { label: "Total countries", value: nfull.format(summary.totalCountries) },
      { label: "With registrations", value: nfull.format(summary.registeredCount) },
      { label: "Without registrations", value: nfull.format(summary.unregisteredCount) },
    ],
    sections: [
      {
        title: "Registration breakdown — GPD Zones, Cell Crusades & networks",
        intro: "Countries, registered crusades, and registration entries by group.",
        columns: [
          { header: "Group", key: "label", width: 3700 },
          { header: "Countries", key: "countries", align: "right", width: 2000 },
          { header: "Crusades", key: "crusades", align: "right", width: 2000 },
          { header: "Registrations", key: "registrations", align: "right", width: 2000 },
        ],
        rows: groups,
      },
      {
        title: "GPD Zones — country breakdown",
        columns: [
          { header: "Country", key: "country", width: 4900 },
          { header: "Crusades", key: "crusades", align: "right", width: 2400 },
          { header: "Registrations", key: "registrations", align: "right", width: 2400 },
        ],
        rows: gpdZones.countries,
      },
      {
        title: "Cell Crusades — country breakdown",
        columns: [
          { header: "Country", key: "country", width: 4900 },
          { header: "Crusades", key: "crusades", align: "right", width: 2400 },
          { header: "Registrations", key: "registrations", align: "right", width: 2400 },
        ],
        rows: cellCrusades.countries,
      },
      ...networks.map((n) => ({
        title: `${n.network} — country breakdown`,
        columns: [
          { header: "Country", key: "country", width: 4900 },
          { header: "Crusades", key: "crusades", align: "right", width: 2400 },
          { header: "Registrations", key: "registrations", align: "right", width: 2400 },
        ],
        rows: n.countries,
      })),
      {
        title: "Countries without registrations",
        intro: `${nfull.format(summary.unregisteredCount)} countries with no registration entries, grouped by continent.`,
        columns: [
          { header: "Continent", key: "continent", width: 3200 },
          { header: "Country", key: "name", width: 6500 },
        ],
        rows: unregisteredByContinent.flatMap((g) =>
          g.countries.map((c) => ({ continent: g.continent, name: c.name }))
        ),
      },
    ],
    footer: "Prepared for Night of a Thousand Crusades (NOTC) country coverage and operational reporting.",
  });
}

export function CountryCoverage() {
  const [data, setData] = React.useState(null);
  const [expandedCharts, setExpandedCharts] = React.useState(() => new Set());

  React.useEffect(() => {
    getJSON("/country-coverage").then(setData).catch((error) => toast.error(error.message || "Could not load country coverage"));
  }, []);

  const toggleExpanded = (id) => setExpandedCharts((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const copyUnregisteredCountries = () => {
    if (!data) return;
    const list = data.unregisteredByContinent.flatMap((g) => g.countries.map((c) => c.name)).join("\n");
    navigator.clipboard.writeText(list);
    toast.success(`Copied ${nf.format(data.summary.unregisteredCount)} countries to clipboard`);
  };

  const exportBreakdownCsv = () => {
    const link = Object.assign(document.createElement("a"), { href: "/api/country-coverage/export" });
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Country coverage" }]} />
        <div className="p-6"><LoadingRows rows={8} /></div>
      </div>
    );
  }

  const { summary, unregisteredByContinent, gpdZones, cellCrusades, networks } = data;
  const percent = Math.round((summary.registeredCount / summary.totalCountries) * 100);
  const charts = [
    {
      id: "gpd-zones",
      title: "GPD Zones — by country",
      meta: `${nfull.format(gpdZones.countryCount)} countries · ${nfull.format(gpdZones.totalCrusades)} crusades · ${nfull.format(gpdZones.totalRegistrations)} registrations`,
      rows: countryBars(gpdZones.countries),
    },
    {
      id: "cell-crusades",
      title: "Cell Crusades — by country",
      meta: `${nfull.format(cellCrusades.countryCount)} countries · ${nfull.format(cellCrusades.totalCrusades)} crusades · ${nfull.format(cellCrusades.totalRegistrations)} registrations`,
      rows: countryBars(cellCrusades.countries),
    },
    ...networks.map((n) => ({
      id: `network-${n.network}`,
      title: `${n.network} — by country`,
      meta: `${nfull.format(n.countries.length)} countries · ${nfull.format(n.totalCrusades)} crusades · ${nfull.format(n.totalRegistrations)} registrations`,
      rows: countryBars(n.countries),
    })),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Country coverage" }]} />

      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Country Coverage Analysis</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            View countries without registrations and breakdown by GPD Zones, Cell Crusades, and networks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportBreakdownCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCountryCoverageWord(data)}>
            <FileText className="size-4" /> Export Word
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Countries" value={summary.totalCountries} icon={<Globe className="size-5 text-blue-600" />} />
        <StatCard label="Countries with Registrations" value={summary.registeredCount} className="bg-emerald-50" valueClass="text-emerald-700" />
        <StatCard label="Countries without Registrations" value={summary.unregisteredCount} className="bg-amber-50" valueClass="text-amber-700" />
      </section>

      <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-sm font-medium text-slate-700">Global coverage</p>
          <p className="text-xs text-slate-500">{percent}% of countries have at least one registration</p>
        </div>
        <div className="flex h-2 w-48 overflow-hidden rounded-full bg-slate-200">
          <span className="bg-emerald-500 transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Registration Breakdown</h3>
          <p className="mt-1 text-sm text-slate-600">
            Registered crusades by country for GPD Zones, Cell Crusades, and each network. Expand a chart to see every country.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {charts.map((chart) => {
            const expanded = expandedCharts.has(chart.id);
            return (
              <Card
                key={chart.id}
                className={cn("rounded-none border-x-0 border-slate-200 shadow-none", expanded && "sm:col-span-2")}
              >
                <CardHeader className="flex-row items-center justify-between space-y-0 bg-slate-50/70 px-4 py-3">
                  <div className="min-w-0">
                    <CardTitle className="text-sm">{chart.title}</CardTitle>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{chart.meta}</p>
                  </div>
                  <button
                    type="button"
                    title={expanded ? "Collapse chart" : "Expand chart"}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${chart.title}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => toggleExpanded(chart.id)}
                  >
                    {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  </button>
                </CardHeader>
                <CardContent className="px-4 py-5">
                  <BarH rows={chart.rows} max={8} expanded={expanded} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-950">Countries without Registrations</h3>
          <Button variant="outline" size="sm" onClick={copyUnregisteredCountries}>
            <Copy className="size-4" /> Copy list
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {unregisteredByContinent.map(({ continent, countries }) => (
            <div key={continent} className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h4 className="font-medium text-slate-900">{continent}</h4>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  {nf.format(countries.length)}
                </span>
              </div>
              <ul className="max-h-48 overflow-y-auto p-3">
                {countries.map((c) => (
                  <li key={c.code} className="py-1 text-sm text-slate-600">{c.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon, className, valueClass }) {
  return (
    <div className={cn("rounded-lg border border-slate-200 bg-white p-5", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {icon}
      </div>
      <p className={cn("mt-2 text-3xl font-bold tabular-nums", valueClass || "text-slate-900")}>{nf.format(value)}</p>
    </div>
  );
}
