import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Info, Printer, Search, ShieldCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/Combobox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getJSON, postJSON } from "@/lib/api";
import { PHONE_CODES } from "@/lib/constants";
import { missionNationSelectionSchema } from "@/lib/schema";

const EMPTY = { minister_type: "zonal_pastor", pastor_name: "", zone_name: "", ministry_name: "", home_country_code: "", mission_country_code: "", contact_email: "", phone_country_code: "", phone_number: "", kingschat_username: "" };
const CONTINENTS = ["Africa", "Asia", "Europe", "North America", "South America", "Oceania"];

function Receipt({ receipt }) {
  return <div className="min-h-screen bg-white">
    <header className="border-b border-slate-200 print:hidden"><div className="mx-auto flex max-w-5xl items-center px-4 py-4 sm:px-6"><img src="/logo.png" alt="" className="h-11 w-auto" /><Link to="/" className="ml-auto text-sm font-semibold text-slate-700 hover:text-slate-950">Return home</Link></div></header>
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
      <div className="flex size-12 items-center justify-center rounded-full bg-slate-950 text-white print:hidden"><Check className="size-6" /></div>
      <p className="mt-8 text-sm font-semibold text-blue-700">Preference received</p>
      <h1 className="mt-3 text-4xl font-normal tracking-[-0.035em] text-slate-950 sm:text-5xl">{receipt.zone_name} prefers {receipt.mission_nation}.</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">This receipt confirms the ministry's mission-nation preference. The final assignment will be made by the NOTC administration.</p>
      <dl className="mt-10 border-y border-slate-200">{[
        ["Receipt", receipt.receipt_code], ["Minister", receipt.pastor_name], ["Zone or network", receipt.zone_name],
        ["Home nation", receipt.home_nation], ["Preferred mission nation", receipt.mission_nation],
        ["Minimum commitment", `${receipt.minimum_crusades.toLocaleString()} crusades`], ["Submitted", `${receipt.submitted_at} UTC`],
      ].map(([label, value]) => <div key={label} className="grid gap-1 border-b border-slate-200 py-4 last:border-0 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-slate-500">{label}</dt><dd className="text-sm font-semibold text-slate-950">{value}</dd></div>)}</dl>
      <div className="mt-8 flex flex-wrap gap-3 print:hidden"><Button onClick={() => window.print()} className="rounded-full"><Printer /> Print receipt</Button><Button variant="outline" className="rounded-full" onClick={() => window.location.reload()}>Make another selection</Button></div>
    </main>
  </div>;
}

export function MissionNationSelection() {
  const [catalogue, setCatalogue] = React.useState(null);
  const [form, setForm] = React.useState(EMPTY);
  const [errors, setErrors] = React.useState({});
  const [query, setQuery] = React.useState("");
  const [continent, setContinent] = React.useState("all");
  const [submitting, setSubmitting] = React.useState(false);
  const [receipt, setReceipt] = React.useState(null);
  const selected = catalogue?.nations.find((nation) => nation.code === form.mission_country_code);
  const homeNation = catalogue?.nations.find((nation) => nation.code === form.home_country_code);
  const isZonalPastor = form.minister_type === "zonal_pastor";
  const isOtherMinister = form.minister_type === "other";

  const load = React.useCallback(() => getJSON("/mission-nations").then(setCatalogue).catch((error) => toast.error(error.message)), []);
  React.useEffect(() => { load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, [load]);

  const countriesFetcher = React.useCallback(async (search) => {
    const value = search.toLowerCase();
    return (catalogue?.nations || []).filter((nation) => nation.name.toLowerCase().includes(value)).map((nation) => ({ value: nation.code, label: nation.name }));
  }, [catalogue]);
  const zonesFetcher = React.useCallback(async (search) => {
    const [rows, networks] = await Promise.all([getJSON("/zones"), getJSON("/networks")]);
    const value = search.toLowerCase();
    return [
      ...rows.filter((row) => row.zone.toLowerCase().includes(value)).map((row) => ({ value: row.zone, label: row.zone, sublabel: `${row.region} · Zone` })),
      ...networks.filter((row) => row.name.toLowerCase().includes(value)).map((row) => ({ value: row.name, label: row.name, sublabel: "Network" })),
    ];
  }, []);

  const visibleNations = (catalogue?.nations || []).filter((nation) => {
    if (query && !nation.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (continent !== "all" && nation.continent !== continent) return false;
    return true;
  });
  const groupedNations = CONTINENTS.map((name) => ({ name, nations: visibleNations.filter((nation) => nation.continent === name) })).filter((group) => group.nations.length);

  function update(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "home_country_code" && current.mission_country_code === value) next.mission_country_code = "";
      return next;
    });
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  async function submit(event) {
    event.preventDefault();
    const parsed = missionNationSelectionSchema.safeParse(form);
    if (!parsed.success) {
      const next = {};
      parsed.error.issues.forEach((issue) => { if (!next[issue.path[0]]) next[issue.path[0]] = issue.message; });
      setErrors(next); toast.error("Complete the required details and select a nation."); return;
    }
    setSubmitting(true);
    try { setReceipt(await postJSON("/mission-nations", parsed.data)); window.scrollTo({ top: 0 }); }
    catch (error) { toast.error(error.message); if (error.code === "ZONE_ALREADY_SELECTED") load(); }
    finally { setSubmitting(false); }
  }

  if (receipt) return <Receipt receipt={receipt} />;
  return <div className="min-h-screen bg-white">
    <header className="border-b border-slate-200"><div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6"><Link to="/"><img src="/logo.png" alt="" className="h-11 w-auto" /></Link><span className="hidden min-w-0 truncate text-sm font-semibold text-slate-950 sm:block">National Missions Leadership Initiative</span><Link to="/" className="ml-auto shrink-0 text-sm font-semibold text-slate-700 hover:text-slate-950">Return home</Link></div></header>
    <main>
      <section className="border-b border-slate-200 bg-slate-950 text-white"><div className="mx-auto grid max-w-6xl lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center"><div className="px-4 py-12 sm:px-6 sm:py-20"><h1 className="max-w-5xl text-4xl font-normal leading-[1.02] tracking-[-0.035em] sm:text-6xl"><span className="mb-4 block text-sm font-semibold leading-5 tracking-normal text-blue-300">NIGHT OF A THOUSAND CRUSADES (NOTC) –</span>NATIONAL MISSIONS LEADERSHIP INITIATIVE</h1><p className="mt-6 max-w-3xl text-lg font-medium text-white">One Minister. One Nation. One Mission. Thousands of Crusades.</p><p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">Ministers serving through zones, networks, churches, and mission structures may express interest in a mission nation outside their home nation. Where multiple ministries share works or interests, the NOTC administration will coordinate the national lead.</p></div><div className="bg-white lg:mr-6"><img src="/national-missions-leadership.png" alt="NOTC National Missions Leadership Initiative" className="aspect-square w-full object-contain" /></div></div></section>

      <form onSubmit={submit} className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="grid gap-8 border-b border-slate-200 pb-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-14"><div><p className="text-sm font-semibold text-blue-700">National responsibility</p><h2 className="mt-3 text-2xl font-medium tracking-[-0.025em] text-slate-950">Lead with ownership.</h2></div><div><p className="max-w-3xl text-sm leading-6 text-slate-600">The appointed National Missions Lead will coordinate crusade strategy, sponsorship mobilisation, missions trips, collaboration, accountability, and reporting—working with existing pastors, churches, leaders, and mission structures in the nation.</p><p className="mt-4 text-sm font-medium leading-6 text-slate-950">The objective is unity of purpose, multiplication of impact, and sustained evangelistic reach across all 242 nations.</p></div></section>
        <section className="grid gap-8 border-b border-slate-200 pb-12 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-14">
          <div><p className="text-sm font-semibold text-blue-700">Minister details</p><h2 className="mt-3 text-2xl font-medium tracking-[-0.025em] text-slate-950">Identify your ministry.</h2><p className="mt-3 text-sm leading-6 text-slate-600">Your declared home nation will be excluded from the mission directory.</p></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Minister type" htmlFor="mission-minister-type" required error={errors.minister_type}><Select id="mission-minister-type" value={form.minister_type} onChange={(e) => { update("minister_type", e.target.value); update("zone_name", ""); update("ministry_name", ""); }}><option value="zonal_pastor">Zonal Pastor</option><option value="ism_minister">ISM Minister</option><option value="reon_minister">REON Minister</option><option value="other">Other</option></Select></Field>
            <Field label="Minister name" htmlFor="mission-pastor-name" required error={errors.pastor_name}><Input id="mission-pastor-name" value={form.pastor_name} onChange={(e) => update("pastor_name", e.target.value)} aria-invalid={Boolean(errors.pastor_name)} placeholder="Full name" /></Field>
            {isZonalPastor && <Field label="Zone" htmlFor="mission-zone" required error={errors.zone_name}><Combobox id="mission-zone" value={form.zone_name} fetcher={zonesFetcher} onSelect={(option) => update("zone_name", option.label)} placeholder="Select zone" searchPlaceholder="Search zones…" invalid={Boolean(errors.zone_name)} caps /></Field>}
            {isOtherMinister && <Field label="Ministry or network" htmlFor="mission-ministry-name" required error={errors.ministry_name}><Input id="mission-ministry-name" value={form.ministry_name} onChange={(e) => update("ministry_name", e.target.value)} aria-invalid={Boolean(errors.ministry_name)} placeholder="Enter your ministry or network" /></Field>}
            <Field label={isZonalPastor ? "Zone home nation" : "Ministry home nation"} htmlFor="mission-home-nation" required error={errors.home_country_code}><Combobox id="mission-home-nation" value={homeNation?.name || ""} fetcher={countriesFetcher} onSelect={(option) => update("home_country_code", option.value)} placeholder="Select home nation" searchPlaceholder="Search 242 nations…" invalid={Boolean(errors.home_country_code)} /></Field>
            <Field label="Email" htmlFor="mission-email" required error={errors.contact_email}><Input id="mission-email" type="email" value={form.contact_email} onChange={(e) => update("contact_email", e.target.value)} aria-invalid={Boolean(errors.contact_email)} placeholder="pastor@example.com" /></Field>
            <Field label="Phone" htmlFor="mission-phone" required error={errors.phone_number || errors.phone_country_code}><div className="flex gap-2"><Select className="w-28 shrink-0" value={form.phone_country_code} onChange={(e) => update("phone_country_code", e.target.value)} aria-label="Phone country code"><option value="">Code</option>{PHONE_CODES.map((code) => <option key={code}>{code}</option>)}</Select><Input id="mission-phone" type="tel" value={form.phone_number} onChange={(e) => update("phone_number", e.target.value)} aria-invalid={Boolean(errors.phone_number)} placeholder="Phone number" /></div></Field>
            <Field label="KingsChat username" htmlFor="mission-kingschat" hint="Optional" error={errors.kingschat_username}><Input id="mission-kingschat" value={form.kingschat_username} onChange={(e) => update("kingschat_username", e.target.value)} aria-invalid={Boolean(errors.kingschat_username)} placeholder="@username" /></Field>
          </div>
        </section>

        <aside className="grid gap-4 border-b border-slate-200 py-8 sm:grid-cols-[auto_1fr] sm:items-start">
          <div className="grid size-9 place-items-center rounded-full bg-blue-50 text-blue-700">
            <Users className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Delegate local execution</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Ministers should delegate local church tasks to the appropriate pastors and leaders so planning and execution can continue smoothly.</p>
          </div>
        </aside>

        <section className="py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-semibold text-blue-700">Mission nation directory</p><h2 className="mt-3 text-3xl font-normal tracking-[-0.03em] text-slate-950">Select one mission nation.</h2><p className="mt-3 text-sm leading-6 text-slate-600">More than one zone or network may prefer the same nation. Your home nation remains unavailable to you.</p></div>{catalogue && <div className="flex gap-6 text-sm"><p><span className="block text-2xl font-medium text-slate-950">{catalogue.total}</span><span className="text-slate-500">Nations</span></p><p><span className="block text-2xl font-medium text-slate-950">{catalogue.preferences}</span><span className="text-slate-500">Preferences</span></p></div>}</div>
          {!catalogue?.selection_open && <div role="alert" className="mt-8 border-y border-amber-300 py-4 text-sm text-amber-900">The selection window is closed. Pastors who did not select a nation may have one designated to their zone.</div>}
          <div className="mt-8 grid border-y border-slate-200 sm:grid-cols-[1fr_13rem]"><label className="relative flex items-center border-b border-slate-200 sm:border-b-0 sm:border-r"><Search className="absolute left-0 size-5 text-slate-500" /><span className="sr-only">Search nations</span><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search 242 nations" className="h-14 rounded-none border-0 bg-transparent pl-8 pr-10 shadow-none focus-visible:ring-0" />{query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 grid size-10 place-items-center" aria-label="Clear nation search"><X className="size-4" /></button>}</label><Select value={continent} onChange={(e) => setContinent(e.target.value)} className="h-14 rounded-none border-0 bg-transparent shadow-none"><option value="all">All continents</option>{CONTINENTS.map((name) => <option key={name}>{name}</option>)}</Select></div>
          <p className="min-h-12 py-4 text-sm text-slate-500" aria-live="polite">{catalogue ? `${visibleNations.length} nation${visibleNations.length === 1 ? "" : "s"} shown` : "Loading mission nations…"}</p>
          {!catalogue ? <div className="grid gap-px bg-slate-200 sm:grid-cols-2"><Skeleton className="h-20 rounded-none" /><Skeleton className="h-20 rounded-none" /><Skeleton className="h-20 rounded-none" /><Skeleton className="h-20 rounded-none" /></div> : visibleNations.length ? <div className="max-h-[34rem] overflow-y-auto overscroll-contain border-y border-slate-200 pr-1 sm:max-h-[38rem]" tabIndex="0" aria-label="Mission nation results">{groupedNations.map((group) => <section key={group.name} aria-labelledby={`continent-${group.name.replaceAll(" ", "-")}`}><h3 id={`continent-${group.name.replaceAll(" ", "-")}`} className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">{group.name} <span className="font-normal text-slate-500">· {group.nations.length}</span></h3><div className="grid sm:grid-cols-2">{group.nations.map((nation) => {
            const isHome = nation.code === form.home_country_code;
            const disabled = !catalogue.selection_open || isHome;
            const active = form.mission_country_code === nation.code;
            return <button key={nation.code} type="button" disabled={disabled} onClick={() => update("mission_country_code", nation.code)} aria-pressed={active} className={`group flex min-h-20 items-center gap-4 border-b border-slate-200 px-3 py-4 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:odd:border-r ${active ? "bg-slate-950 text-white" : disabled ? "cursor-not-allowed text-slate-400" : "hover:bg-slate-50"}`}><span className={`grid size-8 shrink-0 place-items-center rounded-full border text-xs font-semibold ${active ? "border-white bg-white text-slate-950" : "border-slate-300"}`}>{active ? <Check className="size-4" /> : nation.code}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{nation.name}</span><span className={`mt-1 block text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>{isHome ? "Your home nation" : `${nation.interest_count} preference${nation.interest_count === 1 ? "" : "s"} · 1,000 crusades minimum`}</span></span>{!disabled && <ArrowRight className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />}</button>;
          })}</div></section>)}</div> : <div className="border-y border-slate-200 py-14"><p className="font-semibold text-slate-950">No nations match these filters.</p><p className="mt-2 text-sm text-slate-600">Change the search or continent filter.</p></div>}
          {errors.mission_country_code && <p className="mt-3 text-sm text-red-700">{errors.mission_country_code}</p>}
        </section>

        <section className={`${selected ? "flex" : "hidden"} sticky bottom-0 z-20 -mx-4 border-t border-slate-300 bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:border-y lg:px-0 lg:py-6 lg:backdrop-blur-none`}><div className="hidden lg:block">{selected ? <><p className="text-sm font-semibold text-slate-950">{selected.name} preferred</p><p className="mt-1 text-sm text-slate-500">{form.zone_name || "Your ministry"} proposes at least 1,000 crusades in this nation.</p></> : <><p className="text-sm font-semibold text-slate-950">No nation selected</p><p className="mt-1 text-sm text-slate-500">Complete your details and choose one nation.</p></>}</div><Button type="submit" disabled={submitting || !selected || !catalogue?.selection_open} className="w-full rounded-full lg:w-auto"><ShieldCheck />{submitting ? "Submitting…" : selected ? `Submit ${selected.name} preference` : "Submit nation preference"}</Button></section>
        <p className="mt-5 flex gap-2 text-xs leading-5 text-slate-500"><Info className="mt-0.5 size-3.5 shrink-0" />If a zone does not make a selection during the open window, a mission nation may be designated to that zone.</p>
      </form>
    </main>
  </div>;
}
