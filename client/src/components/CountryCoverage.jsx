import * as React from "react";
import { ChevronDown, ChevronRight, Copy, Download, FileDown, Globe } from "lucide-react";
import { toast } from "sonner";
import { getJSON } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { LoadingRows } from "@/components/ui/skeleton";
import { BarH, nfull } from "@/lib/dashboardWidgets";
import { buildNotcReportHtml, openPrintReport } from "@/lib/printReportPdf";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat();

function breakdownGroups(gpdZones, networks) {
  return [
    {
      label: "GPD Zones",
      countries: gpdZones.countryCount,
      crusades: gpdZones.totalCrusades,
      registrations: gpdZones.totalRegistrations,
    },
    ...networks.map((n) => ({
      label: n.network,
      countries: n.countries.length,
      crusades: n.totalCrusades,
      registrations: n.totalRegistrations,
    })),
  ];
}

function exportCountryCoveragePdf(data) {
  const { summary, unregisteredByContinent, gpdZones, networks } = data;
  const groups = breakdownGroups(gpdZones, networks);
  const date = new Date().toISOString().slice(0, 10);

  const sections = [
    {
      title: "Registration breakdown — GPD Zones & networks",
      intro: "Countries, registered crusades, and registration entries by group.",
      columns: [
        { header: "Group", key: "label" },
        { header: "Countries", key: "countries", align: "right" },
        { header: "Crusades", key: "crusades", align: "right" },
        { header: "Registrations", key: "registrations", align: "right" },
      ],
      rows: groups,
    },
    {
      title: "GPD Zones — country breakdown",
      columns: [
        { header: "Country", key: "country" },
        { header: "Crusades", key: "crusades", align: "right" },
        { header: "Registrations", key: "registrations", align: "right" },
      ],
      rows: gpdZones.countries,
    },
    ...networks.map((n) => ({
      title: `${n.network} — country breakdown`,
      columns: [
        { header: "Country", key: "country" },
        { header: "Crusades", key: "crusades", align: "right" },
        { header: "Registrations", key: "registrations", align: "right" },
      ],
      rows: n.countries,
    })),
    {
      title: "Countries without registrations",
      intro: `${nfull.format(summary.unregisteredCount)} countries with no registration entries, grouped by continent.`,
      columns: [
        { header: "Continent", key: "continent" },
        { header: "Country", key: "name" },
      ],
      rows: unregisteredByContinent.flatMap((g) =>
        g.countries.map((c) => ({ continent: g.continent, name: c.name }))
      ),
    },
  ];

  const html = buildNotcReportHtml({
    eyebrow: "Night of a Thousand Crusades",
    title: "Country Coverage Analysis",
    meta: "From the Country coverage page. Includes GPD Zones, networks, and countries without registrations.",
    summary: [
      { label: "Total countries", value: nfull.format(summary.totalCountries) },
      { label: "With registrations", value: nfull.format(summary.registeredCount) },
      { label: "Without registrations", value: nfull.format(summary.unregisteredCount) },
    ],
    sections,
    footer: "Prepared for Night of a Thousand Crusades (NOTC) country coverage and operational reporting.",
  });

  openPrintReport(html, `country-coverage-breakdown-${date}`);
}

export function CountryCoverage() {
  const [data, setData] = React.useState(null);
  const [expandedNetworks, setExpandedNetworks] = React.useState(new Set());
  const [showGpdCountries, setShowGpdCountries] = React.useState(false);
  const [chartsExpanded, setChartsExpanded] = React.useState(false);

  React.useEffect(() => {
    getJSON("/country-coverage").then(setData).catch((error) => toast.error(error.message || "Could not load country coverage"));
  }, []);

  const toggleNetwork = (network) => setExpandedNetworks((prev) => {
    const next = new Set(prev);
    next.has(network) ? next.delete(network) : next.add(network);
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

  const { summary, unregisteredByContinent, gpdZones, networks } = data;
  const percent = Math.round((summary.registeredCount / summary.totalCountries) * 100);
  const groups = breakdownGroups(gpdZones, networks);
  const crusadeBars = groups.map((g) => ({ label: g.label, value: g.crusades }));
  const registrationBars = groups.map((g) => ({ label: g.label, value: g.registrations }));
  const countryBars = groups.map((g) => ({ label: g.label, value: g.countries }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Country coverage" }]} />

      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Country Coverage Analysis</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            View countries without registrations and breakdown by GPD zones and networks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportBreakdownCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCountryCoveragePdf(data)}>
            <FileDown className="size-4" /> Export PDF
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Registration Breakdown</h3>
            <p className="mt-1 text-sm text-slate-600">GPD Zones and networks — same view as the Live dashboard charts.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setChartsExpanded((v) => !v)}>
            {chartsExpanded ? "Show top rows" : "Show all"}
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="Registered crusades by group">
            <BarH rows={crusadeBars} max={9} expanded={chartsExpanded} />
          </ChartCard>
          <ChartCard title="Registration entries by group">
            <BarH rows={registrationBars} max={9} expanded={chartsExpanded} />
          </ChartCard>
          <ChartCard title="Countries represented by group">
            <BarH rows={countryBars} max={9} expanded={chartsExpanded} />
          </ChartCard>
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

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-950">Breakdown detail</h3>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3 text-right">Countries</th>
                <th className="px-4 py-3 text-right">Crusades</th>
                <th className="px-4 py-3 text-right">Registrations</th>
              </tr>
            </thead>
            <tbody>
              <tr
                className="border-b cursor-pointer hover:bg-slate-50 transition-colors bg-blue-50/50"
                onClick={() => setShowGpdCountries(!showGpdCountries)}
              >
                <td className="px-4 py-3 text-slate-400">
                  {showGpdCountries ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </td>
                <td className="px-4 py-3 font-semibold text-blue-900">GPD Zones</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-blue-900">{nf.format(gpdZones.countryCount)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-blue-900">{nf.format(gpdZones.totalCrusades)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-blue-900">{nf.format(gpdZones.totalRegistrations)}</td>
              </tr>
              {showGpdCountries && gpdZones.countries.map((c, i) => (
                <tr key={`gpd-${c.country}`} className={cn("border-b bg-blue-50/30", i === gpdZones.countries.length - 1 && "border-b-2 border-blue-200")}>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 pl-10 text-slate-600">{c.country}</td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{nf.format(c.crusades)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{nf.format(c.registrations)}</td>
                </tr>
              ))}

              {networks.map((n) => (
                <React.Fragment key={n.network}>
                  <tr
                    className="border-b cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleNetwork(n.network)}
                  >
                    <td className="px-4 py-3 text-slate-400">
                      {expandedNetworks.has(n.network) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{n.network}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{nf.format(n.countries.length)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{nf.format(n.totalCrusades)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{nf.format(n.totalRegistrations)}</td>
                  </tr>
                  {expandedNetworks.has(n.network) && n.countries.map((c, i) => (
                    <tr key={`${n.network}-${c.country}`} className={cn("border-b bg-slate-50/50", i === n.countries.length - 1 && "border-b-2")}>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 pl-10 text-slate-600">{c.country}</td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{nf.format(c.crusades)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{nf.format(c.registrations)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">Click a row to expand country details. CSV and PDF exports include the full breakdown.</p>
      </section>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h4 className="mb-4 text-sm font-semibold text-slate-950">{title}</h4>
      {children}
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
