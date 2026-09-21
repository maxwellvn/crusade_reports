import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingRows } from "@/components/ui/skeleton";
import { getJSON } from "@/lib/api";
import { Empty, nfull, typeLabel } from "@/lib/dashboardWidgets";
import { FORMATS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const FILTER_KEYS = [
  "organization_type", "zone", "group_name", "church_name", "network_name",
  "country", "city", "event_type", "format", "date_from", "date_to",
];

const BREAKDOWNS = [
  ["by_zone", "By zone", "zone"],
  ["by_network", "By network", "network_name"],
  ["by_country", "By country", "country"],
  ["by_event_type", "By crusade type", "event_type"],
  ["by_organization_type", "By reporting level", "organization_type"],
  ["by_city", "By city", "city"],
];

const ORG_TYPE_LABELS = { zone: "Zone", group: "Group", church: "Church", cell: "Cell", network: "Network" };
const FORMAT_LABELS = Object.fromEntries(FORMATS);

function labelFor(dimension, key) {
  if (dimension === "event_type") return typeLabel(key);
  if (dimension === "organization_type") return ORG_TYPE_LABELS[key] || String(key).replaceAll("_", " ");
  if (dimension === "format") return FORMAT_LABELS[key] || key;
  return key || "Not specified";
}

export function RhapsodyDistributed() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const queryString = React.useMemo(() => {
    const query = new URLSearchParams();
    for (const key of FILTER_KEYS) if (params.get(key)) query.set(key, params.get(key));
    return query.toString();
  }, [params]);

  React.useEffect(() => {
    setLoading(true);
    getJSON(`/stats/rhapsody-distributed${queryString ? `?${queryString}` : ""}`)
      .then(setData)
      .catch((error) => toast.error(error.message || "Could not load Rhapsody distribution"))
      .finally(() => setLoading(false));
  }, [queryString]);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  }

  function clearFilters() {
    setParams(new URLSearchParams());
  }

  function openCrusades(extra = {}) {
    const query = new URLSearchParams();
    for (const key of FILTER_KEYS) if (params.get(key)) query.set(key, params.get(key));
    for (const [key, value] of Object.entries(extra)) {
      if (value) query.set(key, value); else query.delete(key);
    }
    navigate(`/crusades?${query}`);
  }

  const activeFilters = FILTER_KEYS.filter((key) => params.get(key));
  const filters = data?.filters || {};
  const summary = data?.summary || { physical: 0, online: 0, total: 0, crusades: 0 };

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Rhapsody Distributed" }]} />

      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-orange-700">
            <BookOpen className="size-4" />
            <span className="text-xs font-semibold">Ministry materials</span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">Rhapsody Distributed</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Physical copies from onsite crusades and online copies from online crusades, with breakdowns and filters by zone, network, country and more.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => openCrusades()} disabled={!data}>
          <ExternalLink className="size-4" /> Open matching reports
        </Button>
      </header>

      <section aria-label="Rhapsody distribution summary" className="border-y border-orange-200 bg-white">
        <div className="border-b border-orange-100 bg-orange-50/60 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-950">Distribution totals</h3>
          <p className="mt-1 text-xs text-slate-600">
            {activeFilters.length
              ? "Figures reflect the filters below."
              : "Physical copies from onsite crusades · Online copies from online crusades"}
          </p>
        </div>
        {loading && !data ? (
          <div className="p-5"><LoadingRows rows={2} /></div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4">
            {[
              ["Physical copies", summary.physical, "text-sky-700"],
              ["Online copies", summary.online, "text-cyan-700"],
              ["Total distributed", summary.total, "text-orange-700"],
              ["Crusades counted", summary.crusades, "text-slate-900"],
            ].map(([label, value, tone], index) => (
              <div key={label} className={cn("min-h-24 p-4", index % 2 ? "border-l border-slate-200" : "", index >= 2 ? "border-t border-slate-200 lg:border-t-0" : "", index % 4 ? "lg:border-l" : "lg:border-l-0")}>
                <p className="text-xs text-slate-500">{label}</p>
                <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{nfull.format(value || 0)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Filter Rhapsody distribution" className="border-y border-slate-200 bg-white print:hidden">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Field label="Format">
            <Select value={params.get("format") || ""} onChange={(event) => setFilter("format", event.target.value)}>
              <option value="">Physical and online</option>
              <option value="physical">Physical crusades only</option>
              <option value="online">Online crusades only</option>
            </Select>
          </Field>
          <Field label="Zone">
            <Select value={params.get("zone") || ""} onChange={(event) => setFilter("zone", event.target.value)}>
              <option value="">All zones</option>
              {(filters.zones || []).map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </Select>
          </Field>
          <Field label="Network">
            <Select value={params.get("network_name") || ""} onChange={(event) => setFilter("network_name", event.target.value)}>
              <option value="">All networks</option>
              {(filters.networks || []).map((network) => <option key={network} value={network}>{network}</option>)}
            </Select>
          </Field>
          <Field label="Country">
            <Select value={params.get("country") || ""} onChange={(event) => setFilter("country", event.target.value)}>
              <option value="">All countries</option>
              {(filters.countries || []).map((country) => <option key={country} value={country}>{country}</option>)}
            </Select>
          </Field>
          <Field label="City">
            <Select value={params.get("city") || ""} onChange={(event) => setFilter("city", event.target.value)}>
              <option value="">All cities</option>
              {(filters.cities || []).map((city) => <option key={city} value={city}>{city}</option>)}
            </Select>
          </Field>
          <Field label="Crusade type">
            <Select value={params.get("event_type") || ""} onChange={(event) => setFilter("event_type", event.target.value)}>
              <option value="">All types</option>
              {(filters.event_types || []).map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
            </Select>
          </Field>
          <Field label="Reporting level">
            <Select value={params.get("organization_type") || ""} onChange={(event) => setFilter("organization_type", event.target.value)}>
              <option value="">All levels</option>
              {(filters.organization_types || []).map((type) => (
                <option key={type} value={type}>{ORG_TYPE_LABELS[type] || type}</option>
              ))}
            </Select>
          </Field>
          <Field label="Group">
            <Select value={params.get("group_name") || ""} onChange={(event) => setFilter("group_name", event.target.value)}>
              <option value="">All groups</option>
              {(filters.groups || []).map((group) => <option key={group} value={group}>{group}</option>)}
            </Select>
          </Field>
          <Field label="Church">
            <Select value={params.get("church_name") || ""} onChange={(event) => setFilter("church_name", event.target.value)}>
              <option value="">All churches</option>
              {(filters.churches || []).map((church) => <option key={church} value={church}>{church}</option>)}
            </Select>
          </Field>
          <Field label="Crusade date" className="sm:col-span-2">
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" aria-label="Crusade date from" value={params.get("date_from") || ""} onChange={(event) => setFilter("date_from", event.target.value)} />
              <Input type="date" aria-label="Crusade date to" value={params.get("date_to") || ""} onChange={(event) => setFilter("date_to", event.target.value)} />
            </div>
          </Field>
        </div>
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3">
            <span className="text-xs font-medium text-slate-500">Applied</span>
            {activeFilters.map((key) => (
              <button key={key} type="button" onClick={() => setFilter(key, "")} className="flex cursor-pointer items-center gap-1 rounded-full border bg-slate-100 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-orange-50">
                {key.replaceAll("_", " ")}: {params.get(key)} <X className="size-3" />
              </button>
            ))}
            <button type="button" onClick={clearFilters} className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-900">Clear all</button>
          </div>
        )}
      </section>

      {!data && loading ? (
        <div className="border-y border-slate-200 bg-white p-5"><LoadingRows rows={8} /></div>
      ) : !data ? (
        <Empty text="Rhapsody distribution figures are unavailable right now." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {BREAKDOWNS.map(([key, title, filterField]) => (
            <BreakdownTable
              key={key}
              title={title}
              rows={data[key] || []}
              dimension={filterField}
              onFilter={(value) => setFilter(filterField, value)}
              onOpenReports={(value) => openCrusades({ [filterField]: value })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BreakdownTable({ title, rows, dimension, onFilter, onOpenReports }) {
  return (
    <section className="overflow-hidden border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <span className="text-xs tabular-nums text-slate-500">{nfull.format(rows.length)} groups</span>
      </div>
      {!rows.length ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">No distribution recorded for this category with the current filters.</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-3 py-2 text-right font-medium">Physical</th>
                <th className="px-3 py-2 text-right font-medium">Online</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-100 last:border-0 hover:bg-orange-50/40">
                  <td className="px-4 py-2">
                    <button type="button" className="text-left font-medium text-slate-900 hover:text-orange-700" onClick={() => onFilter(row.key)} title={`Filter by ${row.key}`}>
                      {labelFor(dimension, row.key)}
                    </button>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      <span>{nfull.format(row.crusades || 0)} crusades</span>
                      <button type="button" className="hover:text-blue-700" onClick={() => onOpenReports(row.key)}>View reports</button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-sky-700">{nfull.format(row.physical || 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-cyan-700">{nfull.format(row.online || 0)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums text-orange-700">{nfull.format(row.total || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
