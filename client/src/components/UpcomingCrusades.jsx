import * as React from "react";
import { Link } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { CalendarDays, Check, Globe2, MapPin, Plane, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/Combobox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getJSON, postJSON } from "@/lib/api";
import { useOrgData } from "@/lib/orgForm";
import { upcomingCrusadeInterestSchema } from "@/lib/schema";

const defaults = { designation: "", full_name: "", zone_name: "", group_name: "", passport_country_code: "", opportunity_codes: [], additional_information: "" };

function Confirmation({ result }) {
  const nations = result.opportunities.map((item) => item.nation).join(" and ");
  return <div className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center px-4 py-4 sm:px-6"><img src="/logo.png" alt="" className="h-11" /><Link to="/" className="ml-auto text-sm font-semibold">Return home</Link></div></header><main className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20"><span className="grid size-12 place-items-center rounded-full bg-emerald-700 text-white"><Check /></span><p className="mt-8 text-sm font-semibold text-blue-700">Interest received</p><h1 className="mt-3 text-4xl font-normal tracking-[-0.035em] sm:text-5xl">You selected {nations}.</h1><p className="mt-5 leading-7 text-slate-600">The missions team will review your travel details and contact you. Please wait for confirmation before making travel bookings.</p><dl className="mt-10 border-y border-slate-200">{[["Reference", result.reference_code], ["Zone", result.zone_name], result.group_name && ["Group", result.group_name]].filter(Boolean).map(([label,value]) => <div key={label} className="grid gap-1 border-b border-slate-200 py-4 last:border-0 sm:grid-cols-[10rem_1fr]"><dt className="text-sm text-slate-500">{label}</dt><dd className="text-sm font-semibold">{value}</dd></div>)}{result.opportunities.map((item, index) => <div key={item.code} className="border-b border-slate-200 py-5 last:border-0"><dt className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-700">Choice {index + 1}</dt><dd className="mt-2 font-semibold">{item.nation}</dd><dd className="mt-2 text-sm text-slate-600"><span className="font-semibold text-slate-800">Crusade name:</span> {item.names}</dd><dd className="mt-1 text-sm text-slate-600"><span className="font-semibold text-slate-800">Suggested arrival date:</span> {item.arrival_dates} 2026</dd><dd className="mt-1 text-sm text-slate-600"><span className="font-semibold text-slate-800">Crusade date:</span> {item.dates} 2026</dd><dd className="mt-1 text-sm text-slate-600">{item.cities}</dd></div>)}</dl></main></div>;
}

export function UpcomingCrusades() {
  const [catalogue, setCatalogue] = React.useState([]);
  const [countries, setCountries] = React.useState([]);
  const [query, setQuery] = React.useState("");
  const [result, setResult] = React.useState(null);
  const { register, control, setValue, watch, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(upcomingCrusadeInterestSchema), defaultValues: defaults, mode: "onBlur" });
  const zone = watch("zone_name");
  const selectedCodes = watch("opportunity_codes");
  const selected = selectedCodes.map((code) => catalogue.find((item) => item.code === code)).filter(Boolean);
  const { fetchZones, fetchGroups, clearGroupCache } = useOrgData(zone);

  React.useEffect(() => {
    Promise.all([getJSON("/upcoming-crusades"), getJSON("/countries")])
      .then(([opportunities, countryList]) => { setCatalogue(opportunities.opportunities); setCountries(countryList); })
      .catch((error) => toast.error(error.message));
  }, []);

  const shown = catalogue.filter((item) => `${item.nation} ${item.cities} ${item.names}`.toLowerCase().includes(query.trim().toLowerCase()));
  async function submit(data) {
    try { setResult(await postJSON("/upcoming-crusades/interests", data)); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (error) { toast.error(error.message); }
  }
  function toggleOpportunity(code) {
    if (catalogue.find((item) => item.code === code)?.assigned) return;
    if (selectedCodes.includes(code)) return setValue("opportunity_codes", selectedCodes.filter((item) => item !== code), { shouldValidate: true, shouldDirty: true });
    setValue("opportunity_codes", [code], { shouldValidate: true, shouldDirty: true });
  }

  if (result) return <Confirmation result={result} />;
  return <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6"><Link to="/"><img src="/logo.png" alt="A Night of a Thousand Crusades" className="h-11" /></Link><span className="hidden text-sm font-semibold sm:block">Upcoming Crusades</span><Link to="/" className="ml-auto text-sm font-semibold">Return home</Link></div></header>
    <main>
      <section className="bg-[#121944] text-white"><div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16"><p className="text-sm font-semibold uppercase tracking-[0.08em] text-blue-300">Nations & Continents Edition</p><h1 className="mt-4 max-w-4xl text-4xl font-normal leading-[1.02] tracking-[-0.04em] sm:text-6xl">Upcoming Crusades</h1><div className="mt-6 max-w-4xl space-y-4 text-lg leading-8 text-slate-300"><p>We have crusades planned across different nations and cities, and we would be delighted to have our Pastors participate.</p><p>If you would be interested in travelling to minister at any of the crusades listed below, kindly indicate your preferred crusade. You will be required to sponsor the crusade, including your travel expenses. These expenses will be added to your overall Rhapsody of Realities partnership. Please note that all selections will be subject to the approval of the Man of God, <b>Pastor Chris</b>.</p><p>Each crusade requires a minimum sponsorship of 50,000 Espees in designated locations, while some locations have a minimum sponsorship requirement of 100,000 Espees.</p></div></div></section>

      <form onSubmit={handleSubmit(submit, () => toast.error("Complete the highlighted details and select one crusade."))} className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="grid gap-8 border-b border-slate-200 pb-12 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-14"><div><p className="text-sm font-semibold text-blue-700">Personal details</p><h2 className="mt-3 text-2xl font-medium">Provide your details.</h2><p className="mt-3 text-sm leading-6 text-slate-600">Select your designation, Zone/Group, and provide your name.</p></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Designation" required error={errors.designation?.message} className="sm:col-span-2"><Select {...register("designation")} aria-invalid={Boolean(errors.designation)}><option value="">Select your designation</option>{["Regional Pastor", "Zonal Director", "Zonal Pastor", "Group Pastor", "Campus Regional Secretary", "Campus Zonal Secretary", "Campus Group Pastor"].map((designation) => <option key={designation} value={designation}>{designation}</option>)}</Select></Field><Field label="Full name" required error={errors.full_name?.message}><Input {...register("full_name")} aria-invalid={Boolean(errors.full_name)} /></Field><Field label="Zone" required error={errors.zone_name?.message}><Controller control={control} name="zone_name" render={({ field }) => <Combobox value={field.value} fetcher={fetchZones} onSelect={(option) => { field.onChange(option.value); setValue("group_name", ""); clearGroupCache(); }} placeholder="Select your zone" searchPlaceholder="Search zones…" invalid={Boolean(errors.zone_name)} caps />} /></Field><Field label="Group" hint="Optional" error={errors.group_name?.message}><Controller control={control} name="group_name" render={({ field }) => <Combobox value={field.value} fetcher={fetchGroups} onSelect={(option) => field.onChange(option.label)} disabled={!zone} placeholder={zone ? "Select group, if applicable" : "Select a zone first"} searchPlaceholder="Search groups…" invalid={Boolean(errors.group_name)} caps />} /></Field></div></section>

        <section className="border-b border-slate-200 py-8"><div className="max-w-xl"><Field label="Passport country" required error={errors.passport_country_code?.message}><Select {...register("passport_country_code")} aria-invalid={Boolean(errors.passport_country_code)}><option value="">Select the passport you hold</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</Select></Field></div></section>

        <section className="py-12"><div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-semibold text-blue-700">Published schedule</p><h2 className="mt-3 text-3xl font-normal tracking-[-0.03em]">Select one upcoming crusade.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Choose your preferred crusade.</p></div><div className="relative w-full max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search nation, city or crusade" /></div></div>
          <div className={`mt-6 flex items-center gap-3 border px-4 py-3 text-sm ${errors.opportunity_codes ? "border-red-300 bg-red-50 text-red-800" : selected.length ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-blue-200 bg-blue-50 text-blue-900"}`} role="status" aria-live="polite"><span className={`grid size-7 shrink-0 place-items-center rounded-full text-white ${selected.length ? "bg-emerald-700" : "bg-blue-700"}`}>{selected.length ? <Check className="size-4" /> : <Globe2 className="size-4" />}</span><span className="font-medium">{errors.opportunity_codes ? errors.opportunity_codes.message : selected.length ? `${selected[0].nation} selected.` : "Tap one crusade below to select it."}</span></div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">{shown.map((item) => { const active = selectedCodes.includes(item.code); return <button key={item.code} type="button" disabled={item.assigned} aria-pressed={active} onClick={() => toggleOpportunity(item.code)} className={`group min-w-0 border p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${item.assigned ? "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-700" : active ? "border-slate-950 bg-slate-950 text-white shadow-lg" : "border-slate-200 bg-white hover:border-blue-400 hover:shadow-md"}`}><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-medium">{item.nation}</h3>{item.assigned && <span className="mt-2 inline-flex rounded-full bg-slate-700 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Crusade assigned</span>}</div><span className={`grid size-7 shrink-0 place-items-center rounded-full border ${item.assigned ? "border-slate-400 bg-slate-200 text-slate-700" : active ? "border-white bg-white text-slate-950" : "border-slate-300 text-transparent group-hover:border-blue-600"}`}><Check className="size-4" /></span></div><p className={`mt-3 text-sm font-medium leading-6 ${item.assigned ? "text-slate-700" : active ? "text-slate-200" : "text-slate-700"}`}><span className="font-semibold">Crusade name:</span> {item.names}</p><div className={`mt-4 grid gap-2 p-3 text-xs leading-5 ${item.assigned ? "bg-white/80 text-slate-700" : active ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-600"}`}><span className="inline-flex items-start gap-1.5"><Plane className="mt-0.5 size-3.5 shrink-0" /><span><strong>Suggested arrival date:</strong> {item.arrival_dates} 2026</span></span><span className="inline-flex items-start gap-1.5"><CalendarDays className="mt-0.5 size-3.5 shrink-0" /><span><strong>Crusade date:</strong> {item.dates} 2026</span></span><span className="inline-flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0" />{item.cities}</span></div></button>; })}</div>{!shown.length && <div className="mt-6 border-y border-slate-200 py-12 text-center"><p className="font-semibold">No upcoming crusades match your search.</p></div>}</section>

        <section className="grid gap-8 border-t border-slate-200 py-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-14"><div><p className="text-sm font-semibold text-blue-700">Final note</p><h2 className="mt-3 text-2xl font-medium">Anything the team should know?</h2></div><div><Field label="Additional information" hint="Optional—share relevant travel experience, availability details, or questions." error={errors.additional_information?.message}><Textarea rows={5} {...register("additional_information")} /></Field><div className="mt-8 flex flex-col-reverse gap-4 border-t border-slate-200 pt-7 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-xs leading-5 text-slate-500">Submitting interest does not confirm travel. Wait for the missions department before making bookings.</p><Button type="submit" disabled={isSubmitting} size="lg" className="rounded-full px-7"><Plane />{isSubmitting ? "Submitting…" : selected.length ? `Submit ${selected.length} crusade choice${selected.length === 1 ? "" : "s"}` : "Submit crusade interest"}</Button></div></div></section>
      </form>
    </main>
  </div>;
}
