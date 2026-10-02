/* A zonal crusade ledger in two parts. Palette from the NOTC logo (see .expense-page in index.css): indigo for actions, ink text on white, gold only behind the running total. */
import * as React from "react";
import { Link } from "react-router-dom";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, FileText, Paperclip, Plus, Trash2, X } from "lucide-react";
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

const emptySponsored = () => ({ crusade_name: "", nation: "", city: "", event_date: "", attendance: "", currency_code: "", pastor_flight: "", companions: [], sponsorship_given: "", other_cost_note: "", other_cost_amount: "", espees_equivalent: "", note: "", keep_evidence: [], evidence: [] });
const emptyOwn = () => ({ crusade_name: "", nation: "", city: "", event_date: "", attendance: "", currency_code: "", venue_cost: "", transport_cost: "", espees_equivalent: "", note: "", keep_evidence: [], evidence: [] });
// Part A opens with one empty crusade because most zones were invited to
// exactly one. A zone with none should not have to delete it, so untouched
// rows are dropped before validation ever sees them.
const validate = zodResolver(zoneExpenseReportSchema);
const blankTolerantResolver = (values, context, options) => validate(stripBlankCrusades(values), context, options);

const defaults = { zone_name: "", designation: "", first_name: "", last_name: "", kingschat_username: "", notes: "", espees_already_given: "", sponsorship_paid: "", sponsored: [emptySponsored()], own: [] };

const num = (value) => Number(value) || 0;
const companionSum = (crusade) => (crusade?.companions || []).reduce((total, person) => total + num(person?.flight_cost), 0);
const localSum = (crusade, part) => part === "sponsored"
  ? num(crusade?.pastor_flight) + companionSum(crusade) + num(crusade?.sponsorship_given) + num(crusade?.other_cost_amount)
  : num(crusade?.venue_cost) + num(crusade?.transport_cost);
const espeesSum = (rows = []) => rows.reduce((total, row) => total + num(row?.espees_equivalent), 0);

// A stored report returns each crusade with its saved evidence; keep those ids
// so an edit that does not touch them leaves the files in place.
const toFormValues = (report) => ({
  ...defaults,
  zone_name: report.zone_name, designation: report.designation, first_name: report.first_name,
  last_name: report.last_name, kingschat_username: report.kingschat_username, notes: report.notes || "",
  espees_already_given: report.espees_already_given || "", sponsorship_paid: report.sponsorship_paid ? "yes" : "",
  sponsored: (report.sponsored.length ? report.sponsored.slice(0, 1) : [{}]).map((c) => ({ ...emptySponsored(), ...c, city: c.city || "", other_cost_note: c.other_cost_note || "", note: c.note || "", companions: (c.companions || []).map((p) => ({ name: p.name || "", flight_cost: p.flight_cost })), keep_evidence: (c.evidence || []).map((f) => f.id), evidence: c.evidence || [] })),
  own: report.own.map((c) => ({ ...emptyOwn(), ...c, city: c.city || "", note: c.note || "", keep_evidence: c.evidence.map((f) => f.id), evidence: c.evidence })),
});

// Logo indigo for actions; the shared Button variants hardcode blue hovers.
const PRIMARY_BUTTON = "h-11 rounded-lg px-6 text-[15px] shadow-none hover:bg-[#3b1786] hover:shadow-none";
const OUTLINE_BUTTON = "rounded-lg border-[hsl(var(--input))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]";
const NOTE = "rounded-lg bg-[hsl(var(--accent))] px-4 py-3 text-[15px] leading-6";

function Section({ title, copy, grid = true, children }) {
  return <section className="mt-12 border-t border-[hsl(var(--border))] pt-10"><h2 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h2>{copy && <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">{copy}</p>}<div className={grid ? "mt-7 grid gap-6 sm:grid-cols-2" : "mt-4"}>{children}</div></section>;
}

function PageHeader({ onOpenReport }) {
  return <header className="border-b border-[hsl(var(--border))]"><div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3 sm:gap-6"><Link to="/" aria-label="A Night of a Thousand Crusades — home"><img src="/logo.png" alt="" className="h-10" /></Link><span className="hidden min-w-0 truncate text-[15px] font-semibold md:block">Zonal Crusade Expense Report</span>{onOpenReport && <button type="button" onClick={onOpenReport} className="ml-auto shrink-0 text-[15px] font-semibold text-[hsl(var(--primary))] underline-offset-4 hover:underline">Open your zone&rsquo;s report</button>}<Link to="/" className={`${onOpenReport ? "" : "ml-auto "}shrink-0 text-[15px] font-semibold text-[hsl(var(--primary))] underline-offset-4 hover:underline`}>Return home</Link></div></header>;
}

function Confirmation({ result, editing }) {
  const rows = [["Zone", result.zone_name], ["Part A — invited by Rhapsody", `${result.sponsored.length} crusade${result.sponsored.length === 1 ? "" : "s"} · E ${money(result.sponsored_espees)}`], ["Part B — your own crusades", `${result.own.length} crusade${result.own.length === 1 ? "" : "s"} · E ${money(result.own_espees)}`], ["Total", `E ${money(result.total_espees)}`], ["Already given", `E ${money(result.espees_already_given)}`], ["Reference", result.reference_code]];
  return <div className="expense-page min-h-screen"><PageHeader /><main className="mx-auto max-w-2xl px-5 py-16 sm:py-20"><span className="grid size-12 place-items-center rounded-full bg-[hsl(var(--primary))] text-white"><Check /></span><h1 className="mt-8 text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">{editing ? "Your expense report is updated." : "Thank you for what you have done for NOTC."}</h1><p className="mt-5 text-lg leading-8 text-muted-foreground">{result.first_name}, the crusade expenses for {result.zone_name} are on file across {result.crusade_count} mega crusade{result.crusade_count === 1 ? "" : "s"}.</p><dl className="mt-10 border-y border-[hsl(var(--border))]">{rows.map(([label, value]) => <div key={label} className="grid gap-1 border-b border-[hsl(var(--border))] py-4 last:border-0 sm:grid-cols-[14rem_1fr]"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl><p className={`mt-8 ${NOTE}`}>To add the rest of your upcoming crusades or correct anything, return to this page, choose <strong>Open your zone&rsquo;s report</strong>, and enter your zone with the KingsChat username <strong>{result.kingschat_username}</strong>.</p></main></div>;
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
  return <div role="group" aria-label="Open your zone's report" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); open(); } }} className="mt-8 rounded-xl border border-[hsl(var(--border))] p-5 sm:p-6"><h2 className="text-xl font-semibold">Open your zone&rsquo;s report</h2><p className="mt-2 max-w-xl leading-7 text-muted-foreground">Each zone keeps one expense report. Enter the zone and the KingsChat username it was submitted with to review or update it. If your zone has not reported yet, fill in the form below.</p><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label="Zone" required><Combobox value={zone} fetcher={fetchZones} onSelect={(o) => setZone(o.value)} placeholder="Select your zone" caps /></Field><Field label="KingsChat username" required error={error}><Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@username" autoComplete="off" /></Field></div><div className="mt-6 flex flex-wrap gap-3"><Button type="button" onClick={open} disabled={busy} className={PRIMARY_BUTTON}>{busy ? "Opening…" : "Open report"}</Button></div></div>;
}

// Receipts and pictorial evidence. Saved files stay listed until removed; new
// picks are held on the crusade row and posted with the form.
function EvidencePicker({ part, index, saved, kept, onKeptChange, picked, onPick }) {
  const inputId = `evidence-${part}-${index}`;
  const visible = saved.filter((file) => kept.includes(file.id));
  return <div className="sm:col-span-2"><div className="flex flex-wrap items-center gap-3"><input id={inputId} type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => { onPick([...picked, ...Array.from(e.target.files || [])]); e.target.value = ""; }} /><Button type="button" variant="outline" className={OUTLINE_BUTTON} asChild><label htmlFor={inputId} className="cursor-pointer !text-[15px]"><Paperclip /> Add receipts or photos</label></Button><p className="text-sm text-muted-foreground">Receipts (PDF or photo) and pictorial evidence of the crusade.</p></div>
    {(visible.length > 0 || picked.length > 0) && <ul className="mt-3 flex flex-wrap gap-2">
      {visible.map((file) => <li key={`saved-${file.id}`} className="inline-flex items-center gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm"><FileText className="size-4 text-muted-foreground" />{file.original_name}<button type="button" onClick={() => onKeptChange(kept.filter((id) => id !== file.id))} aria-label={`Remove ${file.original_name}`} className="-m-1 p-1"><X className="size-4" /></button></li>)}
      {picked.map((file, fileIndex) => <li key={`new-${fileIndex}-${file.name}`} className="inline-flex items-center gap-2 rounded-md bg-[hsl(var(--accent))] px-3 py-1.5 text-sm text-[hsl(var(--accent-foreground))]"><FileText className="size-4" />{file.name}<button type="button" onClick={() => onPick(picked.filter((_, i) => i !== fileIndex))} aria-label={`Remove ${file.name}`} className="-m-1 p-1"><X className="size-4" /></button></li>)}
    </ul>}</div>;
}

// React 18 strips `ref` from props spread across a component boundary, so the
// field registers itself here rather than receiving register()'s result.
const AmountField = ({ label, required, error, code, register, name }) => <Field label={label || undefined} required={required} error={error}><div className="relative"><span title={code ? currencyName(code) || code : "Select a currency first"} className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-muted-foreground">{code || "—"}</span><Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" className="pl-12 tabular-nums" {...register(name)} /></div></Field>;


// Each accompanying person is quoted separately — a zone may send several and
// their flights rarely cost the same.
function CompanionList({ part, index, control, register, errors, code }) {
  const { fields, append, remove } = useFieldArray({ control, name: `${part}.${index}.companions` });
  const rows = useWatch({ control, name: `${part}.${index}.companions` }) || [];
  const total = rows.reduce((sum, person) => sum + num(person?.flight_cost), 0);
  return <div className="sm:col-span-2">
    <div className="space-y-1"><p className="text-[15px] font-medium">Accompanying persons</p><p className="text-sm text-muted-foreground">Add each person who travelled with the pastor and what their flight cost.</p></div>
    {fields.length > 0 && <ul className="mt-3 space-y-3">{fields.map((row, personIndex) => <li key={row.id} className="grid gap-3 sm:grid-cols-[1fr_12rem_2.5rem] sm:items-start">
      <Field error={errors?.[part]?.[index]?.companions?.[personIndex]?.name?.message}><Input placeholder="Name of person" aria-label={`Accompanying person ${personIndex + 1} name`} {...register(`${part}.${index}.companions.${personIndex}.name`)} /></Field>
      <AmountField label="" code={code} error={errors?.[part]?.[index]?.companions?.[personIndex]?.flight_cost?.message} register={register} name={`${part}.${index}.companions.${personIndex}.flight_cost`} />
      <Button type="button" variant="ghost" size="icon" className="h-11 text-muted-foreground hover:bg-red-50 hover:text-red-700" onClick={() => remove(personIndex)} aria-label={`Remove accompanying person ${personIndex + 1}`}><Trash2 /></Button>
    </li>)}</ul>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <Button type="button" variant="outline" className={OUTLINE_BUTTON} onClick={() => append({ name: "", flight_cost: "" })}><Plus /> Add accompanying person</Button>
      {fields.length > 0 && <p className="text-sm text-muted-foreground">{fields.length} {fields.length === 1 ? "person" : "people"} · <span className="font-semibold tabular-nums text-[hsl(var(--foreground))]">{code ? `${code} ` : ""}{money(total)}</span></p>}
    </div>
  </div>;
}

function CrusadeCard({ part, index, count, register, control, setValue, errors, crusade, onRemove, files, setFiles, fetchCountries, cityFetcherFor }) {
  const err = errors?.[part]?.[index] || {};
  const code = crusade?.currency_code || "";
  const local = localSum(crusade, part);
  // Part A is a single crusade, so it reads as one plain form — no row label,
  // nothing to remove. Part B repeats, so its rows keep both.
  return <li className="border-t border-[hsl(var(--border))] py-8 first:border-t-0 first:pt-2">{part === "own" && <div className="flex items-center justify-between gap-4"><h3 className="text-lg font-semibold">Crusade {index + 1}{count > 1 ? ` of ${count}` : ""}</h3>{onRemove && <Button type="button" variant="ghost" className="text-muted-foreground hover:bg-red-50 hover:text-red-700" onClick={onRemove}><Trash2 /> Remove</Button>}</div>}
    <div className={`grid gap-6 sm:grid-cols-2 ${part === "own" ? "mt-5" : ""}`}>
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
        <CompanionList part={part} index={index} control={control} register={register} errors={errors} code={code} />
        <AmountField label="Amount already given for crusade sponsorship" code={code} error={err.sponsorship_given?.message} register={register} name={`${part}.${index}.sponsorship_given`} />
        <AmountField label="Other costs" code={code} error={err.other_cost_amount?.message} register={register} name={`${part}.${index}.other_cost_amount`} />
        <Field label="What were the other costs?" error={err.other_cost_note?.message}><Input {...register(`${part}.${index}.other_cost_note`)} placeholder="Describe them" /></Field>
      </> : <>
        <AmountField label="Venue" code={code} error={err.venue_cost?.message} register={register} name={`${part}.${index}.venue_cost`} />
        <AmountField label="Transportation" code={code} error={err.transport_cost?.message} register={register} name={`${part}.${index}.transport_cost`} />
      </>}

      <div className="grid gap-5 rounded-lg bg-[hsl(var(--accent))] p-4 sm:col-span-2 sm:grid-cols-2">
        <div className="flex items-baseline justify-between gap-4 sm:col-span-2"><span className="text-muted-foreground">Actual cost in {code ? `${currencyName(code) || code} (${code})` : "local currency"}</span><span className="font-semibold tabular-nums">{code ? `${code} ${money(local)}` : money(local)}</span></div>
        <AmountField label="Equivalent in Espees" required code="E" error={err.espees_equivalent?.message} register={register} name={`${part}.${index}.espees_equivalent`} />
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

  const cardProps = { register, control, setValue, errors, fetchCountries, cityFetcherFor };
  return <div className="expense-page min-h-screen"><PageHeader onOpenReport={editing || lookingUp ? null : () => setLookingUp(true)} />
    <main className="mx-auto grid max-w-6xl gap-12 px-5 pb-28 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
    <form onSubmit={handleSubmit(submit, () => toast.error("Check the highlighted details."))} className="min-w-0 max-w-3xl">
      {editing && <p className="mb-3 text-[15px] font-medium text-[hsl(var(--primary))]">Editing · submitted {editing.created_at.slice(0, 10)}</p>}
      <h1 className="text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">Crusade expenses for your zone</h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">One report per zone, in two parts. Part A is the crusade the Rhapsody department invited you to. Part B is the mega crusades your zone planned and held.</p>
      {editing ? <p className={`mt-6 max-w-2xl ${NOTE}`}>You are updating the existing report for <strong>{editing.zone_name}</strong>. <button type="button" onClick={startNew} className="font-semibold text-[hsl(var(--accent-foreground))] underline underline-offset-2">Start a different report</button></p>
        : null}
      {lookingUp && !editing && <LookupPanel fetchZones={fetchZones} onFound={loadReport} />}

      <Section title="Zone and your details">
        <Field label="Zone" required error={errors.zone_name?.message} className="sm:col-span-2"><Controller control={control} name="zone_name" render={({ field }) => <Combobox value={field.value} fetcher={fetchZones} onSelect={(o) => field.onChange(o.value)} disabled={Boolean(editing)} placeholder="Select your zone" caps invalid={Boolean(errors.zone_name)} />} /></Field>
        <Field label="Designation" required error={errors.designation?.message} className="sm:col-span-2"><Select {...register("designation")}><option value="">Select designation</option>{EXPENSE_DESIGNATIONS.map((v) => <option key={v}>{v}</option>)}</Select></Field>
        <Field label="First name" required error={errors.first_name?.message}><Input {...register("first_name")} autoComplete="given-name" /></Field>
        <Field label="Last name" required error={errors.last_name?.message}><Input {...register("last_name")} autoComplete="family-name" /></Field>
        <Field label="KingsChat username" required hint={editing ? "Must match the username used to submit" : "You will need this to reopen the report"} error={errors.kingschat_username?.message} className="sm:col-span-2"><Input {...register("kingschat_username")} placeholder="@username" autoComplete="off" /></Field>
      </Section>

      <Section grid={false} title="Crusade sponsorship" copy="Kindly let us know the Espees given toward the crusade sponsorship and whether it was paid successfully. Expenses will be added once the crusade sponsorship has been paid."><div className="mt-7 grid max-w-md gap-6">
        <AmountField label="Espees given for the crusade sponsorship" code="E" error={errors.espees_already_given?.message} register={register} name="espees_already_given" />
        <Field label="Was your crusade sponsorship paid successfully?" required error={errors.sponsorship_paid?.message}><Controller control={control} name="sponsorship_paid" render={({ field }) => (
          <div role="radiogroup" aria-label="Was your crusade sponsorship paid successfully?" className="flex flex-wrap gap-2">{[["yes", "Yes, it was paid"], ["no", "Not yet"]].map(([value, label]) => <label key={value} className={`flex h-11 cursor-pointer items-center rounded-lg border px-4 text-[15px] font-medium transition-colors duration-150 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[hsl(var(--primary)/0.2)] ${field.value === value ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white" : "border-[hsl(var(--input))] bg-white hover:border-[hsl(var(--primary))]"}`}><input type="radio" className="sr-only" name={field.name} value={value} checked={field.value === value} onChange={() => field.onChange(value)} onBlur={field.onBlur} />{label}</label>)}</div>)} /></Field>
        {values.sponsorship_paid === "no" && <p className={NOTE}>Thank you. Please go ahead and fill in your expenses below; our team will follow up on the sponsorship from our end.</p>}
      </div></Section>

      <Section grid={false} title="Part A: the crusade you were invited to by the Rhapsody department" copy="Flights, what your zone has already given toward the sponsorship, and any other costs. Leave it blank if your zone was not invited to one.">
        <ul>{sponsored.fields.map((row, index) => <CrusadeCard key={row.id} part="sponsored" index={index} count={1} {...cardProps} crusade={values.sponsored?.[index]} files={filesFor("sponsored", index)} setFiles={setFilesFor("sponsored", index)} />)}</ul>
        <p className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-4 text-[15px] text-muted-foreground">Part A total <span className="font-semibold tabular-nums text-[hsl(var(--foreground))]">E {money(sponsoredEspees)}</span></p>
      </Section>

      <Section grid={false} title="Part B: mega crusades your zone held" copy={`Crusades your zone planned and held, with ${MEGA_CRUSADE_MINIMUM.toLocaleString()} or more in attendance. Venue and transportation, with evidence.`}>
        <ul>{own.fields.length === 0 ? <li className="py-6 text-muted-foreground">No crusades added yet.</li> : own.fields.map((row, index) => <CrusadeCard key={row.id} part="own" index={index} count={own.fields.length} {...cardProps} crusade={values.own?.[index]} onRemove={() => removeCrusade("own", index, own)} files={filesFor("own", index)} setFiles={setFilesFor("own", index)} />)}</ul>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-4"><Button type="button" variant="outline" className={OUTLINE_BUTTON} onClick={() => own.append(emptyOwn())}><Plus /> Add a crusade your zone held</Button><p className="flex gap-3 text-[15px] text-muted-foreground">Part B total <span className="font-semibold tabular-nums text-[hsl(var(--foreground))]">E {money(ownEspees)}</span></p></div>
        {partsError && <p className="mt-3 text-sm font-medium text-destructive">{partsError}</p>}
      </Section>

      <section className="mt-12 border-t border-[hsl(var(--border))] pt-10"><Field label="Notes" hint="Anything the administration should know, including crusades still coming up."><Textarea rows={4} {...register("notes")} /></Field>
        <div className="mt-10 flex flex-col gap-5 rounded-xl border border-[hsl(var(--border))] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-muted-foreground">Total in Espees</p><p className="mt-0.5 text-2xl font-semibold tabular-nums">E {money(total)}</p></div><Button type="submit" disabled={isSubmitting} className={PRIMARY_BUTTON}>{isSubmitting ? "Saving…" : editing ? "Update expense report" : "Submit expense report"}</Button></div>
        <p className="mt-4 text-[15px] leading-6 text-muted-foreground">Leave Part A blank if your zone was not invited to a crusade. Reopen the report any time with your zone and KingsChat username.</p>
      </section>
    </form>

    <aside aria-labelledby="expense-summary" className="lg:sticky lg:top-8 lg:self-start">
      <div className="rounded-xl border border-[hsl(var(--border))] p-6" aria-live="polite">
        <h2 id="expense-summary" className="text-lg font-semibold">Summary</h2>
        <dl className="mt-4 space-y-3 text-[15px]">{[...(values.zone_name ? [["Zone", values.zone_name]] : []), ["Part A", `E ${money(sponsoredEspees)}`], ["Part B", `E ${money(ownEspees)}`], ["Crusades", crusadeCount]].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="truncate text-right font-medium tabular-nums">{value}</dd></div>)}</dl>
        <div className="mt-5 border-t border-[hsl(var(--border))] pt-5"><p className="text-[15px] text-muted-foreground">Total in Espees</p><p className="mt-1 text-3xl font-semibold tabular-nums tracking-[-0.02em]"><span className="expense-total">E {money(total)}</span></p></div>
      </div>
      <div className="mt-6 px-1"><h2 className="text-[15px] font-semibold">Before you submit</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-6 text-muted-foreground marker:text-[hsl(var(--primary))]"><li>Enter costs in the currency you actually paid in, then give the equivalent in Espees.</li><li>Mega crusades only: {MEGA_CRUSADE_MINIMUM.toLocaleString()} in attendance and above.</li><li>Attach receipts and pictorial evidence to each crusade.</li></ul></div>
    </aside>
    </main></div>;
}
