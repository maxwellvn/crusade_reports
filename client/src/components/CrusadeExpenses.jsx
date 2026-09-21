/* THESIS: A zonal crusade ledger in two parts, not a generic claim form. OWN-WORLD: campaign navy, paper white, partnership gold. STORY: who you are → the crusades we sent you to → the ones you held yourself → what each cost, with proof. */
import * as React from "react";
import { Link } from "react-router-dom";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Coins, FileText, MapPin, Paperclip, Plane, Plus, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/Combobox";
import { getJSON, postForm, putForm, postJSON } from "@/lib/api";
import { EXPENSE_DESIGNATIONS, MEGA_CRUSADE_MINIMUM, stripBlankCrusades, zoneExpenseReportSchema } from "@/lib/schema";
import { useOrgData } from "@/lib/orgForm";

const espees = new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CURRENCY_CODES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : ["NGN", "USD", "GBP", "EUR", "ZAR", "GHS", "KES", "XOF", "XAF"];
// A bare list of 160+ codes tells a pastor nothing, so carry the currency name
// and let them search either half.
const displayNames = (() => { try { return new Intl.DisplayNames(["en"], { type: "currency" }); } catch { return null; } })();
// Only ISO codes are valid here; "E" (Espees) and "" would throw a RangeError.
const currencyName = (code) => { try { return /^[A-Za-z]{3}$/.test(code || "") ? displayNames?.of(code) : ""; } catch { return ""; } };
const CURRENCIES = CURRENCY_CODES.map((code) => ({ value: code, label: code, sublabel: currencyName(code) || "" }))
  .filter((option) => option.sublabel !== option.value);
const searchCurrencies = async (query) => {
  const needle = query.trim().toLowerCase();
  return needle ? CURRENCIES.filter((o) => o.value.toLowerCase().includes(needle) || o.sublabel.toLowerCase().includes(needle)) : CURRENCIES;
};
const money = (value) => espees.format(Number(value) || 0);

const emptySponsored = () => ({ crusade_name: "", nation: "", city: "", event_date: "", attendance: "", currency_code: "", pastor_flight: "", accompanying_count: "", accompanying_flight: "", sponsorship_given: "", other_cost_note: "", other_cost_amount: "", espees_equivalent: "", espees_already_given: "", note: "", keep_evidence: [], evidence: [] });
const emptyOwn = () => ({ crusade_name: "", nation: "", city: "", event_date: "", attendance: "", currency_code: "", venue_cost: "", transport_cost: "", espees_equivalent: "", note: "", keep_evidence: [], evidence: [] });
// Part A opens with one empty crusade because most zones were invited to
// exactly one. A zone with none should not have to delete it, so untouched
// rows are dropped before validation ever sees them.
const validate = zodResolver(zoneExpenseReportSchema);
const blankTolerantResolver = (values, context, options) => validate(stripBlankCrusades(values), context, options);

const defaults = { zone_name: "", designation: "", first_name: "", last_name: "", kingschat_username: "", notes: "", sponsored: [emptySponsored()], own: [] };

const num = (value) => Number(value) || 0;
const localSum = (crusade, part) => part === "sponsored"
  ? num(crusade?.pastor_flight) + num(crusade?.accompanying_flight) + num(crusade?.sponsorship_given) + num(crusade?.other_cost_amount)
  : num(crusade?.venue_cost) + num(crusade?.transport_cost);
const espeesSum = (rows = []) => rows.reduce((total, row) => total + num(row?.espees_equivalent), 0);

// A stored report returns each crusade with its saved evidence; keep those ids
// so an edit that does not touch them leaves the files in place.
const toFormValues = (report) => ({
  ...defaults,
  zone_name: report.zone_name, designation: report.designation, first_name: report.first_name,
  last_name: report.last_name, kingschat_username: report.kingschat_username, notes: report.notes || "",
  sponsored: (report.sponsored.length ? report.sponsored.slice(0, 1) : [{}]).map((c) => ({ ...emptySponsored(), ...c, city: c.city || "", other_cost_note: c.other_cost_note || "", note: c.note || "", keep_evidence: (c.evidence || []).map((f) => f.id), evidence: c.evidence || [] })),
  own: report.own.map((c) => ({ ...emptyOwn(), ...c, city: c.city || "", note: c.note || "", keep_evidence: c.evidence.map((f) => f.id), evidence: c.evidence })),
});

function Section({ icon: Icon, title, copy, children }) {
  return <section className="mt-12"><div className="flex gap-3"><Icon className="mt-1 size-5 text-amber-600" /><div><h3 className="text-2xl font-medium tracking-[-0.02em]">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{copy}</p></div></div><div className="mt-6 grid gap-5 border-y border-black/15 py-8 sm:grid-cols-2">{children}</div></section>;
}

function Confirmation({ result, editing }) {
  const rows = [["Zone", result.zone_name], ["Part A — invited by Rhapsody", `${result.sponsored.length} crusade${result.sponsored.length === 1 ? "" : "s"} · E ${money(result.sponsored_espees)}`], ["Part B — your own crusades", `${result.own.length} crusade${result.own.length === 1 ? "" : "s"} · E ${money(result.own_espees)}`], ["Total", `E ${money(result.total_espees)}`], ["Already given", `E ${money(result.espees_already_given)}`], ["Reference", result.reference_code]];
  return <div className="min-h-screen bg-[#f6f2e8]"><header className="border-b border-black/10 bg-white"><div className="mx-auto flex max-w-6xl items-center px-5 py-4"><img src="/logo.png" alt="" className="h-11" /><Link to="/" className="ml-auto text-sm font-semibold">Return home</Link></div></header><main className="mx-auto max-w-3xl px-5 py-20"><span className="grid size-14 place-items-center rounded-full bg-[#18234d] text-white"><Check /></span><p className="mt-8 text-sm font-semibold text-amber-700">{editing ? "Expense report updated" : "Expense report received"}</p><h1 className="mt-3 text-5xl font-medium leading-none tracking-[-0.04em] text-slate-950">Thank you for what you have done for NOTC.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">{result.first_name}, the crusade expenses for {result.zone_name} are on file across {result.crusade_count} mega crusade{result.crusade_count === 1 ? "" : "s"}.</p><dl className="mt-12 border-y border-black/15">{rows.map(([label, value]) => <div key={label} className="grid border-b border-black/10 py-4 last:border-0 sm:grid-cols-[14rem_1fr]"><dt className="text-sm text-slate-500">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl><p className="mt-8 border-l-2 border-amber-500 pl-5 text-sm leading-6 text-slate-700">To add the rest of your upcoming crusades or correct anything, return to this page, choose <strong>Open your zone&rsquo;s report</strong>, and enter your zone with the KingsChat username <strong>{result.kingschat_username}</strong>.</p></main></div>;
}

function LookupPanel({ fetchZones, onFound }) {
  const [zone, setZone] = React.useState(""); const [handle, setHandle] = React.useState(""); const [busy, setBusy] = React.useState(false); const [error, setError] = React.useState("");
  // Rendered inside the report form, so this is a div, not a nested <form>.
  async function open(event) {
    event?.preventDefault(); setError("");
    if (!zone) return setError("Select your zone");
    if (!handle.trim()) return setError("Enter the KingsChat username used to submit");
    setBusy(true);
    try { onFound(await postJSON("/crusade-expenses/lookup", { zone_name: zone, kingschat_username: handle })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div role="group" aria-label="Open your zone's report" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); open(); } }} className="mt-10 border-y border-black/15 py-8"><p className="text-sm font-semibold text-amber-700">Open your zone&rsquo;s report</p><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Each zone keeps one expense report. Enter the zone and the KingsChat username it was submitted with to review or update it. If your zone has not reported yet, fill in the form below.</p><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label="Zone" required><Combobox value={zone} fetcher={fetchZones} onSelect={(o) => setZone(o.value)} placeholder="Select your zone" caps /></Field><Field label="KingsChat username" required error={error}><Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@username" autoComplete="off" /></Field></div><div className="mt-6 flex flex-wrap gap-3"><Button type="button" onClick={open} disabled={busy} className="rounded-full bg-[#18234d] px-7 transition-[transform,background-color] duration-150 hover:bg-[#24346d] active:scale-[0.96]">{busy ? "Opening…" : "Open report"}</Button></div></div>;
}

// Receipts and pictorial evidence. Saved files stay listed until removed; new
// picks are held on the crusade row and posted with the form.
function EvidencePicker({ part, index, saved, kept, onKeptChange, picked, onPick }) {
  const inputId = `evidence-${part}-${index}`;
  const visible = saved.filter((file) => kept.includes(file.id));
  return <div className="sm:col-span-2"><div className="flex flex-wrap items-center gap-3"><input id={inputId} type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => { onPick([...picked, ...Array.from(e.target.files || [])]); e.target.value = ""; }} /><Button type="button" variant="outline" size="sm" className="rounded-full transition-[transform,background-color] duration-150 active:scale-[0.96]" asChild><label htmlFor={inputId} className="cursor-pointer"><Paperclip /> Add receipts or photos</label></Button><p className="text-xs text-slate-500">Receipts (PDF or photo) and pictorial evidence of the crusade.</p></div>
    {(visible.length > 0 || picked.length > 0) && <ul className="mt-3 flex flex-wrap gap-2">
      {visible.map((file) => <li key={`saved-${file.id}`} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs"><FileText className="size-3 text-slate-500" />{file.original_name}<button type="button" onClick={() => onKeptChange(kept.filter((id) => id !== file.id))} aria-label={`Remove ${file.original_name}`}><X className="size-3" /></button></li>)}
      {picked.map((file, fileIndex) => <li key={`new-${fileIndex}-${file.name}`} className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs"><FileText className="size-3 text-amber-700" />{file.name}<button type="button" onClick={() => onPick(picked.filter((_, i) => i !== fileIndex))} aria-label={`Remove ${file.name}`}><X className="size-3" /></button></li>)}
    </ul>}</div>;
}

// React 18 strips `ref` from props spread across a component boundary, so the
// field registers itself here rather than receiving register()'s result.
const AmountField = ({ label, required, error, code, register, name }) => <Field label={label} required={required} error={error}><div className="relative"><span title={code ? currencyName(code) || code : "Select a currency first"} className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-slate-500">{code || "—"}</span><Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" className="pl-12 tabular-nums" {...register(name)} /></div></Field>;

function CrusadeCard({ part, index, count, register, control, setValue, errors, crusade, onRemove, files, setFiles, fetchCountries, cityFetcherFor }) {
  const err = errors?.[part]?.[index] || {};
  const code = crusade?.currency_code || "";
  const local = localSum(crusade, part);
  // Part A is a single crusade, so it reads as one plain form — no row label,
  // nothing to remove. Part B repeats, so its rows keep both.
  return <li className="border-t border-black/10 py-8 first:border-t-0">{part === "own" && <div className="flex items-start justify-between gap-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Mega crusade{count > 1 ? ` ${index + 1}` : ""}</p>{onRemove && <Button type="button" variant="ghost" size="sm" className="text-slate-500 hover:text-red-700" onClick={onRemove}><Trash2 /> Remove</Button>}</div>}
    <div className={`grid gap-5 sm:grid-cols-2 ${part === "own" ? "mt-5" : ""}`}>
      <Field label="Crusade name" required error={err.crusade_name?.message}><Input {...register(`${part}.${index}.crusade_name`)} placeholder="Name of the crusade" /></Field>
      <Field label="Nation" required error={err.nation?.message}><Controller control={control} name={`${part}.${index}.nation`} render={({ field }) => (
        <Combobox value={field.value} invalid={Boolean(err.nation)} placeholder="Select or search country" searchPlaceholder="Scroll or type a country…"
          minChars={0} emptyText="No countries found" fetcher={fetchCountries}
          onSelect={(option) => { field.onChange(option.label); setValue(`${part}.${index}.city`, ""); }} />)} /></Field>
      <Field label="City" error={err.city?.message}><Controller control={control} name={`${part}.${index}.city`} render={({ field }) => (
        <Combobox value={field.value} disabled={!crusade?.nation} placeholder={crusade?.nation ? "Search city" : "Pick a nation first"}
          searchPlaceholder="Type a city…" minChars={1} emptyText="No cities found" allowCreate fetcher={cityFetcherFor(crusade?.nation)}
          onSelect={(option) => field.onChange(option.label)} />)} /></Field>
      <Field label="Date held" required error={err.event_date?.message}><Input type="date" {...register(`${part}.${index}.event_date`)} /></Field>
      {part === "own" && <Field label="Attendance" required hint={`Mega crusades only — ${MEGA_CRUSADE_MINIMUM.toLocaleString()} and above`} error={err.attendance?.message}><Input type="number" inputMode="numeric" min={MEGA_CRUSADE_MINIMUM} step="1" className="tabular-nums" {...register(`${part}.${index}.attendance`)} /></Field>}
      <Field label="Currency you paid in" required error={err.currency_code?.message}><Controller control={control} name={`${part}.${index}.currency_code`} render={({ field }) => (
        <Combobox value={field.value} invalid={Boolean(err.currency_code)} placeholder="Select or search currency" searchPlaceholder="Type a currency or code…"
          minChars={0} emptyText="No currencies found" fetcher={searchCurrencies} onSelect={(option) => field.onChange(option.value)} />)} /></Field>

      {part === "sponsored" ? <>
        <AmountField label="Pastor's flight" code={code} error={err.pastor_flight?.message} register={register} name={`${part}.${index}.pastor_flight`} />
        <Field label="Accompanying person(s)" hint="How many travelled with the pastor" error={err.accompanying_count?.message}><Input type="number" inputMode="numeric" min="0" step="1" className="tabular-nums" {...register(`${part}.${index}.accompanying_count`)} /></Field>
        <AmountField label="Accompanying flights" code={code} error={err.accompanying_flight?.message} register={register} name={`${part}.${index}.accompanying_flight`} />
        <AmountField label="Already given for sponsorship" code={code} error={err.sponsorship_given?.message} register={register} name={`${part}.${index}.sponsorship_given`} />
        <AmountField label="Other costs" code={code} error={err.other_cost_amount?.message} register={register} name={`${part}.${index}.other_cost_amount`} />
        <Field label="What were the other costs?" error={err.other_cost_note?.message}><Input {...register(`${part}.${index}.other_cost_note`)} placeholder="Describe them" /></Field>
      </> : <>
        <AmountField label="Venue" code={code} error={err.venue_cost?.message} register={register} name={`${part}.${index}.venue_cost`} />
        <AmountField label="Transportation" code={code} error={err.transport_cost?.message} register={register} name={`${part}.${index}.transport_cost`} />
      </>}

      <div className="grid gap-5 border-t border-black/10 pt-6 sm:col-span-2 sm:grid-cols-2">
        <div className="flex items-baseline justify-between gap-4 text-sm sm:col-span-2"><span className="text-slate-500">Actual cost in {code ? `${currencyName(code) || code} (${code})` : "local currency"}</span><span className="font-semibold tabular-nums">{code ? `${code} ${money(local)}` : money(local)}</span></div>
        <AmountField label="Equivalent in Espees" required code="E" error={err.espees_equivalent?.message} register={register} name={`${part}.${index}.espees_equivalent`} />
        {part === "sponsored" && <AmountField label="Espees already given" code="E" error={err.espees_already_given?.message} register={register} name={`${part}.${index}.espees_already_given`} />}
      </div>
      <Field label="Note" className="sm:col-span-2" error={err.note?.message}><Input {...register(`${part}.${index}.note`)} placeholder="Anything else about this crusade" /></Field>
      <Controller control={control} name={`${part}.${index}.keep_evidence`} render={({ field }) => <EvidencePicker part={part} index={index} saved={crusade?.evidence || []} kept={field.value || []} onKeptChange={field.onChange} picked={files} onPick={setFiles} />} />
    </div></li>;
}

export function CrusadeExpenses() {
  const [result, setResult] = React.useState(null); const [editing, setEditing] = React.useState(null); const [lookingUp, setLookingUp] = React.useState(false);
  // Files live outside react-hook-form: File objects are not form state.
  const [files, setFiles] = React.useState({});
  const { register, control, handleSubmit, watch, reset, setError, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: blankTolerantResolver, defaultValues: defaults });
  const sponsored = useFieldArray({ control, name: "sponsored" });
  const own = useFieldArray({ control, name: "own" });
  const { fetchZones, fetchCountries, countryCodeOf } = useOrgData();
  // Each crusade carries its own nation, so its city search is scoped to it.
  const cityFetcherFor = React.useCallback((countryName) => {
    const code = countryCodeOf(countryName);
    return async (query) => {
      const results = await getJSON(`/places/autocomplete?input=${encodeURIComponent(query)}${code ? `&country=${code}` : ""}`);
      return results.map((place) => ({ value: place.place_id, label: place.main, sublabel: place.secondary }));
    };
  }, [countryCodeOf]);
  const values = watch();
  const sponsoredEspees = espeesSum(values.sponsored); const ownEspees = espeesSum(values.own);
  const total = sponsoredEspees + ownEspees; const crusadeCount = (values.sponsored?.length || 0) + (values.own?.length || 0);

  const filesFor = (part, index) => files[`${part}_${index}`] || [];
  const setFilesFor = (part, index) => (next) => setFiles((current) => ({ ...current, [`${part}_${index}`]: next }));
  function removeCrusade(part, index, array) { array.remove(index); setFiles((current) => { const next = { ...current }; delete next[`${part}_${index}`]; return next; }); }

  function loadReport(report) { setEditing(report); setLookingUp(false); setFiles({}); reset(toFormValues(report)); toast.success(`Opened the report for ${report.zone_name}.`); }
  function startNew() { setEditing(null); setLookingUp(false); setFiles({}); reset(defaults); }

  async function submit(payload) {
    const body = new FormData();
    body.append("payload", JSON.stringify(payload));
    for (const part of ["sponsored", "own"]) {
      (payload[part] || []).forEach((_, index) => { for (const file of filesFor(part, index)) body.append(`evidence_${part}_${index}`, file); });
    }
    try {
      const saved = editing ? await putForm(`/crusade-expenses/${editing.id}`, body) : await postForm("/crusade-expenses", body);
      setResult(saved); window.scrollTo({ top: 0 });
    } catch (e) {
      if (e.code === "ZONE_ALREADY_REPORTED") { setError("zone_name", { message: e.message }); setLookingUp(true); }
      toast.error(e.message);
    }
  }
  if (result) return <Confirmation result={result} editing={Boolean(editing)} />;

  const partsError = errors.sponsored?.root?.message || (typeof errors.sponsored?.message === "string" ? errors.sponsored.message : "");

  return <div className="min-h-screen bg-[#f6f2e8] text-slate-950"><header className="border-b border-black/10 bg-white"><div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4"><Link to="/"><img src="/logo.png" alt="A Night of a Thousand Crusades" className="h-11" /></Link><span className="hidden min-w-0 truncate text-sm font-semibold sm:block">Zonal Crusade Expense Report</span><Link to="/" className="ml-auto shrink-0 text-sm font-semibold">Return home</Link></div></header>
    <main className="mx-auto grid max-w-7xl lg:grid-cols-[24rem_minmax(0,1fr)]"><aside className="bg-[#18234d] text-white lg:sticky lg:top-0 lg:min-h-[calc(100vh-77px)] lg:self-start"><div className="space-y-8 px-6 py-10 sm:px-10"><div><p className="text-sm font-semibold text-amber-300">Zonal expense report</p><h1 className="mt-3 text-3xl font-medium leading-tight tracking-[-0.035em]">What did your zone invest in the crusades?</h1><p className="mt-4 leading-7 text-slate-300">Part A covers the crusade the Rhapsody department invited you to. Part B covers the mega crusades your zone planned and held.</p></div>
      <div className="border-t border-white/20 pt-7" aria-live="polite"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Total in Espees</p><p className="mt-2 text-4xl font-medium tabular-nums tracking-[-0.03em]">E {money(total)}</p><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-400">Part A</dt><dd className="mt-0.5 font-semibold tabular-nums">E {money(sponsoredEspees)}</dd></div><div><dt className="text-slate-400">Part B</dt><dd className="mt-0.5 font-semibold tabular-nums">E {money(ownEspees)}</dd></div><div><dt className="text-slate-400">Crusades</dt><dd className="mt-0.5 font-semibold tabular-nums">{crusadeCount}</dd></div>{values.zone_name && <div><dt className="text-slate-400">Zone</dt><dd className="mt-0.5 font-semibold">{values.zone_name}</dd></div>}</dl></div>
      <div className="space-y-5 border-t border-white/20 pt-7"><p className="flex gap-3 text-sm leading-6 text-slate-300"><Coins className="mt-0.5 size-5 shrink-0 text-amber-300" /><span>Enter costs in the currency you actually paid in, then give the equivalent in Espees.</span></p><p className="flex gap-3 text-sm leading-6 text-slate-300"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-300" /><span>Mega crusades only — {MEGA_CRUSADE_MINIMUM.toLocaleString()} in attendance and above.</span></p><p className="flex gap-3 text-sm leading-6 text-slate-300"><Paperclip className="mt-0.5 size-5 shrink-0 text-amber-300" /><span>Attach receipts and pictorial evidence to each crusade.</span></p></div></div></aside>
    <form onSubmit={handleSubmit(submit, () => toast.error("Check the highlighted details."))} className="bg-white px-5 py-12 sm:px-10 lg:px-14 lg:py-16"><div className="max-w-3xl"><p className="text-sm font-semibold text-amber-700">{editing ? `Editing · submitted ${editing.created_at.slice(0, 10)}` : "Zonal expense report"}</p><h2 className="mt-3 text-3xl font-medium leading-tight tracking-[-0.035em] sm:text-4xl">Crusade expenses for your zone</h2><p className="mt-4 max-w-2xl leading-7 text-slate-600">One consolidated report per zone, in two parts: the crusade the Rhapsody department invited you to, and the mega crusades your zone planned and held.</p>
      {editing ? <p className="mt-5 max-w-2xl border-l-2 border-amber-500 pl-5 text-sm leading-6 text-slate-700">You are updating the existing report for <strong>{editing.zone_name}</strong>. <button type="button" onClick={startNew} className="font-semibold underline underline-offset-2">Start a different report</button></p>
        : lookingUp ? null : <p className="mt-5 max-w-2xl border-l-2 border-amber-500 pl-5 text-sm leading-6 text-slate-700">Already submitted for your zone? <button type="button" onClick={() => setLookingUp(true)} className="font-semibold underline underline-offset-2">Open your zone&rsquo;s report</button> to add crusades or update it. Otherwise fill in the form below.</p>}
      {lookingUp && !editing && <LookupPanel fetchZones={fetchZones} onFound={loadReport} />}

      <Section icon={MapPin} title="Zone" copy="The zone this report belongs to. One report is kept per zone."><Field label="Zone" required error={errors.zone_name?.message} className="sm:col-span-2"><Controller control={control} name="zone_name" render={({ field }) => <Combobox value={field.value} fetcher={fetchZones} onSelect={(o) => field.onChange(o.value)} disabled={Boolean(editing)} placeholder="Select your zone" caps invalid={Boolean(errors.zone_name)} />} /></Field></Section>

      <Section icon={UserRound} title="Your details" copy="Your KingsChat username is how you reopen this report later."><Field label="Designation" required error={errors.designation?.message} className="sm:col-span-2"><Select {...register("designation")}><option value="">Select designation</option>{EXPENSE_DESIGNATIONS.map((v) => <option key={v}>{v}</option>)}</Select></Field><Field label="First name" required error={errors.first_name?.message}><Input {...register("first_name")} autoComplete="given-name" /></Field><Field label="Last name" required error={errors.last_name?.message}><Input {...register("last_name")} autoComplete="family-name" /></Field><Field label="KingsChat username" required hint={editing ? "Must match the username used to submit" : "You will need this to reopen the report"} error={errors.kingschat_username?.message} className="sm:col-span-2"><Input {...register("kingschat_username")} placeholder="@username" autoComplete="off" /></Field></Section>

      <section className="mt-14"><div className="flex gap-3"><Plane className="mt-1 size-5 text-amber-600" /><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Part A</p><h3 className="mt-1 text-2xl font-medium tracking-[-0.02em]">Crusade you were invited to by the Rhapsody department</h3><p className="mt-1 text-sm leading-6 text-slate-600">The one crusade the department invited your zone to: flights, what your zone has already given toward the sponsorship, and any other costs. Leave it blank if your zone was not invited to one.</p></div></div>
        <ul className="mt-6 border-y border-black/15">{sponsored.fields.map((row, index) => <CrusadeCard key={row.id} part="sponsored" index={index} count={1} register={register} control={control} setValue={setValue} errors={errors} fetchCountries={fetchCountries} cityFetcherFor={cityFetcherFor} crusade={values.sponsored?.[index]} files={filesFor("sponsored", index)} setFiles={setFilesFor("sponsored", index)} />)}</ul>
        <div className="flex flex-wrap items-center justify-end gap-4 py-5"><p className="text-sm text-slate-500">Part A total <span className="ml-2 font-semibold tabular-nums text-slate-950">E {money(sponsoredEspees)}</span></p></div></section>

      <section className="mt-10"><div className="flex gap-3"><Coins className="mt-1 size-5 text-amber-600" /><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Part B</p><h3 className="mt-1 text-2xl font-medium tracking-[-0.02em]">Mega crusades your zone held</h3><p className="mt-1 text-sm leading-6 text-slate-600">Crusades your zone planned and held — {MEGA_CRUSADE_MINIMUM.toLocaleString()} in attendance and above. Venue and transportation, with evidence.</p></div></div>
        <ul className="mt-6 border-y border-black/15">{own.fields.length === 0 ? <li className="py-8 text-sm text-slate-500">No crusades added yet.</li> : own.fields.map((row, index) => <CrusadeCard key={row.id} part="own" index={index} count={own.fields.length} register={register} control={control} setValue={setValue} errors={errors} fetchCountries={fetchCountries} cityFetcherFor={cityFetcherFor} crusade={values.own?.[index]} onRemove={() => removeCrusade("own", index, own)} files={filesFor("own", index)} setFiles={setFilesFor("own", index)} />)}</ul>
        <div className="flex flex-wrap items-center justify-between gap-4 py-5"><Button type="button" variant="outline" className="rounded-full transition-[transform,background-color] duration-150 active:scale-[0.96]" onClick={() => own.append(emptyOwn())}><Plus /> Add a crusade your zone held</Button><p className="text-sm text-slate-500">Part B total <span className="ml-2 font-semibold tabular-nums text-slate-950">E {money(ownEspees)}</span></p></div>
        {partsError && <p className="text-xs font-medium text-red-700">{partsError}</p>}</section>

      <section className="py-10"><Field label="Notes" hint="Anything the administration should know — including crusades still coming up."><Textarea rows={4} {...register("notes")} /></Field><div className="mt-8 flex flex-col-reverse gap-4 border-t border-black/10 pt-8 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-xs leading-5 text-slate-500">Leave Part A blank if your zone was not invited to a crusade. Reopen the report any time with your zone and KingsChat username.</p><Button type="submit" disabled={isSubmitting} className="rounded-full bg-[#18234d] px-7 transition-[transform,background-color] duration-150 hover:bg-[#24346d] active:scale-[0.96]">{isSubmitting ? "Saving…" : editing ? "Update expense report" : "Submit expense report"}</Button></div></section>
    </div></form></main></div>;
}
