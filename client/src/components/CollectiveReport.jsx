import * as React from "react";
import { FileDown, FileSpreadsheet, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { LoadingRows } from "@/components/ui/skeleton";
import { downloadFile, getJSON } from "@/lib/api";

const figures = new Intl.NumberFormat("en-US");
const n = (value) => figures.format(Number(value) || 0);
const label = (value) => String(value || "Not specified").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const OUTCOME_LABELS = {
  salvation: "Souls won",
  holy_spirit_filled: "Holy Spirit baptisms",
  water_baptisms: "Water baptisms",
  ror_distributed: "Rhapsody distributed",
  bibles_distributed: "Bibles distributed",
  online_participation: "Online participation",
  radio_tv_reach: "Radio/TV reach",
  testimonies_recorded: "Testimonies recorded",
  tap2read_distributed: "TAP2read distributed",
  ntyba_distributed: "NTYBA distributed",
  healing_nations_magazine: "Healing to the Nations magazine",
  crusade_expense: "Crusade expenses",
};

export function CollectiveReport() {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [downloading, setDownloading] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await getJSON("/collective-report"));
    } catch (error) {
      toast.error(error.message || "Could not load the collective report");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function exportReport(format) {
    setDownloading(format);
    try {
      const name = format === "pdf" ? "comprehensive-crusade-report.pdf" : "collective-report-ecard-figures.xlsx";
      await downloadFile(`/collective-report/export.${format}`, name);
    } catch (error) {
      toast.error(error.message || "Could not download the collective report");
    } finally {
      setDownloading("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Collective report" }]} />
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-blue-700">Nations & Continents Edition</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">Collective report</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Review the overall registration, reporting, ministry outcome and coverage figures in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button type="button" variant="outline" onClick={load} disabled={loading} title="Refresh report figures">
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
          <Button type="button" variant="outline" onClick={() => exportReport("xlsx")} disabled={!data || Boolean(downloading)}>
            <FileSpreadsheet /> {downloading === "xlsx" ? "Preparing..." : "E-card figures"}
          </Button>
          <Button type="button" onClick={() => exportReport("pdf")} disabled={!data || Boolean(downloading)}>
            <FileDown /> {downloading === "pdf" ? "Preparing..." : "Download PDF"}
          </Button>
        </div>
      </header>

      {loading && !data ? <div className="border-y border-slate-200 bg-white p-5"><LoadingRows rows={10} /></div> : data ? <ReportBody data={data} /> : (
        <div className="border-y border-slate-200 bg-white py-16 text-center text-sm text-slate-500">The collective report is unavailable right now.</div>
      )}
    </div>
  );
}

function ReportBody({ data }) {
  const headline = [
    ["Crusades registered", data.headline.total_crusades_registered],
    ["Crusades reported held", data.headline.crusades_reported_as_held],
    ["Report submissions", data.headline.report_submissions_received],
    ["Combined attendance", data.reports.combined_attendance],
    ["Souls won", data.reports.salvation],
    ["Countries registered", data.public_registration.countries],
  ];
  return <>
    <section aria-labelledby="summary-heading" className="overflow-hidden border-y border-blue-200 bg-white shadow-[0_18px_45px_-34px_rgba(37,99,235,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50/70 px-5 py-3">
        <h3 id="summary-heading" className="text-xs font-semibold text-blue-900">Overall summary</h3>
        <p className="text-xs text-slate-500">Registrations and submitted reports</p>
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {headline.map(([name, value], index) => <div key={name} className={`min-w-0 p-4 sm:p-5 ${index % 2 ? "border-l" : ""} ${index >= 2 ? "border-t md:border-t-0" : ""} ${index >= 3 ? "md:border-t xl:border-t-0" : ""} xl:border-l ${index === 0 ? "xl:border-l-0" : ""} border-blue-100`}>
          <dt className="text-xs leading-5 text-slate-500">{name}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{n(value)}</dd>
        </div>)}
      </dl>
    </section>

    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      <ReportSection title="Registration and reporting" description="Planned registrations are kept separate from crusades reported as held.">
        <SimpleTable columns={["Measure", "Total"]} rows={[
          ["Public crusades registered", data.headline.public_crusades_registered],
          ["Blue Elite crusades registered", data.headline.blue_elite_crusades_registered],
          ["Online crusades registered", data.headline.online_crusades_registered],
          ["Onsite crusades registered", data.headline.onsite_crusades_registered],
          ["Registrations with reports", data.registration_progress.linked_reports],
          ["Registrations awaiting reports", data.registration_progress.awaiting_reports],
        ]} />
      </ReportSection>
      <ReportSection title="Ministry outcomes" description="Totals submitted across completed crusade reports.">
        <SimpleTable columns={["Outcome", "Total"]} rows={data.outcomes.map((row) => [OUTCOME_LABELS[row.key] || label(row.key), row.value])} />
      </ReportSection>
    </div>

    <ReportSection title="Crusade initiative breakdown" description="Compare planned registrations with completed reports and ministry reach.">
      <div className="overflow-x-auto"><table className="min-w-[50rem] w-full text-sm"><thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><Head>Initiative</Head><Head right>Registered</Head><Head right>Held</Head><Head right>Combined reach</Head><Head right>Souls won</Head></tr></thead><tbody>{mergeInitiatives(data).map((row) => <tr key={row.key} className="border-b last:border-0 hover:bg-slate-50/60"><Cell strong>{row.label}</Cell><Cell right>{n(row.registered)}</Cell><Cell right>{n(row.held)}</Cell><Cell right>{n(row.reach)}</Cell><Cell right>{n(row.salvations)}</Cell></tr>)}</tbody></table></div>
    </ReportSection>

    <div className="grid gap-8 xl:grid-cols-2">
      <ReportSection title="Coverage by continent" description="Countries and completed reports grouped by continent.">
        <div className="overflow-x-auto"><table className="min-w-[34rem] w-full text-sm"><thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><Head>Continent</Head><Head right>Countries</Head><Head right>Held</Head><Head right>Attendance</Head></tr></thead><tbody>{data.geography.report_continents.map((row) => <tr key={row.continent} className="border-b last:border-0"><Cell strong>{row.continent}</Cell><Cell right>{n(row.countries)}</Cell><Cell right>{n(row.crusades_reported)}</Cell><Cell right>{n(row.combined_attendance)}</Cell></tr>)}</tbody></table></div>
      </ReportSection>
      <ReportSection title="Leading countries" description={`${n(data.geography.report_country_count)} countries have submitted reports.`}>
        <div className="overflow-x-auto"><table className="min-w-[34rem] w-full text-sm"><thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><Head>Country</Head><Head right>Held</Head><Head right>Attendance</Head><Head right>Souls won</Head></tr></thead><tbody>{data.geography.report_countries.slice(0, 12).map((row) => <tr key={row.country} className="border-b last:border-0"><Cell strong>{row.country}</Cell><Cell right>{n(row.crusades_reported)}</Cell><Cell right>{n(row.combined_attendance)}</Cell><Cell right>{n(row.salvations)}</Cell></tr>)}</tbody></table></div>
      </ReportSection>
    </div>

    <ReportSection title="Special initiatives" description="Participation recorded through the campaign's supporting initiatives.">
      <dl className="grid grid-cols-2 border-y border-slate-200 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Mission nation selections", data.special_initiatives.mission_nations],
          ["Media training registrations", data.special_initiatives.media_training.registrations],
          ["Media training trainees", data.special_initiatives.media_training.trainees],
          ["Upcoming crusade interests", data.special_initiatives.upcoming_crusades],
          ["Mission trip volunteers", data.special_initiatives.mission_trips],
        ].map(([name, value]) => <div key={name} className="border-b border-r border-slate-200 p-4 last:border-r-0"><dt className="text-xs leading-5 text-slate-500">{name}</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-blue-800">{n(value)}</dd></div>)}
      </dl>
    </ReportSection>
  </>;
}

function mergeInitiatives(data) {
  const reports = new Map(data.report_initiatives.map((row) => [row.key, row]));
  const rows = data.registration_initiatives.map((row) => {
    const reported = reports.get(row.key) || {};
    reports.delete(row.key);
    return { key: row.key, label: row.label, registered: row.registered_crusades, held: reported.crusades, reach: reported.combined_reach, salvations: reported.salvations };
  });
  for (const row of reports.values()) rows.push({ key: row.key, label: row.label, registered: 0, held: row.crusades, reach: row.combined_reach, salvations: row.salvations });
  return rows.sort((left, right) => right.registered - left.registered || right.held - left.held);
}

function ReportSection({ title, description, children }) {
  return <section className="min-w-0"><header className="mb-3 border-b-2 border-blue-700 pb-3"><h3 className="text-lg font-semibold text-slate-950">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></header><div className="bg-white">{children}</div></section>;
}
function SimpleTable({ columns, rows }) { return <table className="w-full text-sm"><thead><tr className="border-b bg-slate-50 text-left text-xs text-slate-500"><Head>{columns[0]}</Head><Head right>{columns[1]}</Head></tr></thead><tbody>{rows.map(([name, value]) => <tr key={name} className="border-b last:border-0"><Cell>{name}</Cell><Cell right>{n(value)}</Cell></tr>)}</tbody></table>; }
function Head({ right, children }) { return <th className={`px-4 py-3 font-medium ${right ? "text-right" : ""}`}>{children}</th>; }
function Cell({ right, strong, children }) { return <td className={`px-4 py-3 ${right ? "text-right tabular-nums text-slate-700" : strong ? "font-medium text-slate-950" : "text-slate-700"}`}>{children}</td>; }
