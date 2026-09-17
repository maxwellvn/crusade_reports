/* THESIS: A zonal expense ledger, not a generic claim form. OWN-WORLD: campaign navy, paper white, partnership gold. STORY: zone → who you are → what it covered → what it cost, with the Espees total living in the aside. */
import * as React from "react";
import { Link } from "react-router-dom";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarRange, Check, Coins, MapPin, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/Combobox";
import { postJSON, putJSON } from "@/lib/api";
import { PHONE_CODES } from "@/lib/constants";
import { EXPENSE_CATEGORIES, zoneExpenseReportSchema } from "@/lib/schema";
import { useOrgData } from "@/lib/orgForm";

const DESIGNATIONS = ["Regional Pastor", "Zonal Director", "Zonal Pastor"];
const espees = new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const emptyLine = () => ({ category: "", amount_espees: "", note: "" });
const defaults = { zone_name: "", designation: "", first_name: "", last_name: "", email: "", phone_country_code: "", phone_number: "", kingschat_username: "", crusade_count: "", period_from: "", period_to: "", notes: "", items: [emptyLine()] };
const sum = (items) => items.reduce((total, item) => total + (Number(item?.amount_espees) || 0), 0);

// A stored report comes back with the handle prefixed and amounts as numbers; shape it for the form.
const toFormValues = (report) => ({ ...defaults, ...Object.fromEntries(Object.keys(defaults).map((key) => [key, report[key] ?? defaults[key]])), notes: report.notes || "", items: report.items.map((item) => ({ category: item.category, amount_espees: item.amount_espees, note: item.note || "" })) });

function Section({ icon: Icon, title, copy, children }) { return <section className="mt-12"><div className="flex gap-3"><Icon className="mt-1 size-5 text-amber-600" /><div><h3 className="text-2xl font-medium tracking-[-0.02em]">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{copy}</p></div></div><div className="mt-6 grid gap-5 border-y border-black/15 py-8 sm:grid-cols-2">{children}</div></section>; }

function Confirmation({ result, editing }) {
  const perCrusade = result.crusade_count ? result.total_espees / result.crusade_count : 0;
  return <div className="min-h-screen bg-[#f6f2e8]"><header className="border-b border-black/10 bg-white"><div className="mx-auto flex max-w-6xl items-center px-5 py-4"><img src="/logo.png" alt="" className="h-11" /><Link to="/" className="ml-auto text-sm font-semibold">Return home</Link></div></header><main className="mx-auto max-w-3xl px-5 py-20"><span className="grid size-14 place-items-center rounded-full bg-[#18234d] text-white"><Check /></span><p className="mt-8 text-sm font-semibold text-amber-700">{editing ? "Expense report updated" : "Expense report received"}</p><h1 className="mt-3 text-5xl font-medium leading-none tracking-[-0.04em] text-slate-950">Thank you for keeping the record.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">{result.first_name}, the expenses for {result.zone_name} are on file. The NOTC administration can now see what your zone invested across {result.crusade_count} crusade{result.crusade_count === 1 ? "" : "s"}.</p><dl className="mt-12 border-y border-black/15">{[["Zone", result.zone_name], ["Total expenses", `ES ${espees.format(result.total_espees)}`], ["Per crusade", `ES ${espees.format(perCrusade)}`], ["Lines recorded", result.items.length], ["Reference", result.reference_code]].map(([label, value]) => <div key={label} className="grid border-b border-black/10 py-4 last:border-0 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-slate-500">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}</dl><p className="mt-8 border-l-2 border-amber-500 pl-5 text-sm leading-6 text-slate-700">To change anything later, return to this page, choose <strong>Open your zone&rsquo;s report</strong>, and enter your zone with the KingsChat username <strong>{result.kingschat_username}</strong>.</p></main></div>;
}

function LookupPanel({ fetchZones, onFound, onCancel }) {
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
  return <div role="group" aria-label="Open your zone's report" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); open(); } }} className="mt-10 border-y border-black/15 py-8"><p className="text-sm font-semibold text-amber-700">Open your zone&rsquo;s report</p><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Each zone keeps one expense report. Enter the zone and the KingsChat username it was submitted with to review or update it.</p><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label="Zone" required><Combobox value={zone} fetcher={fetchZones} onSelect={(o) => setZone(o.value)} placeholder="Select your zone" caps /></Field><Field label="KingsChat username" required error={error}><Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@username" autoComplete="off" /></Field></div><div className="mt-6 flex flex-wrap gap-3"><Button type="button" onClick={open} disabled={busy} className="rounded-full bg-[#18234d] px-7 hover:bg-[#24346d] active:scale-[0.96] transition-[transform,background-color] duration-150">{busy ? "Opening…" : "Open report"}</Button><Button type="button" variant="ghost" className="rounded-full" onClick={onCancel}>Start a new report instead</Button></div></div>;
}

export function CrusadeExpenses() {
  const [result, setResult] = React.useState(null); const [editing, setEditing] = React.useState(null); const [lookingUp, setLookingUp] = React.useState(false);
  const { register, control, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(zoneExpenseReportSchema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const { fetchZones } = useOrgData();
  const items = watch("items"); const crusadeCount = Number(watch("crusade_count")) || 0; const zone = watch("zone_name");
  const total = sum(items);

  function loadReport(report) { setEditing(report); setLookingUp(false); reset(toFormValues(report)); toast.success(`Opened the report for ${report.zone_name}.`); }
  function startNew() { setEditing(null); setLookingUp(false); reset(defaults); }

  async function submit(values) {
    try {
      const saved = editing ? await putJSON(`/crusade-expenses/${editing.id}`, values) : await postJSON("/crusade-expenses", values);
      setResult(saved); window.scrollTo({ top: 0 });
    } catch (e) {
      if (e.code === "ZONE_ALREADY_REPORTED") { setError("zone_name", { message: e.message }); setLookingUp(true); }
      toast.error(e.message);
    }
  }
  if (result) return <Confirmation result={result} editing={Boolean(editing)} />;

  return <div className="min-h-screen bg-[#f6f2e8] text-slate-950"><header className="border-b border-black/10 bg-white"><div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4"><Link to="/"><img src="/logo.png" alt="A Night of a Thousand Crusades" className="h-11" /></Link><span className="hidden min-w-0 truncate text-sm font-semibold sm:block">Zonal Crusade Expense Report</span><Link to="/" className="ml-auto shrink-0 text-sm font-semibold">Return home</Link></div></header>
    <main className="mx-auto grid max-w-7xl lg:grid-cols-[24rem_minmax(0,1fr)]"><aside className="bg-[#18234d] text-white lg:sticky lg:top-0 lg:min-h-[calc(100vh-77px)] lg:self-start"><div className="space-y-8 px-6 py-10 sm:px-10"><div><p className="text-sm font-semibold text-amber-300">Zonal expense report</p><h1 className="mt-3 text-3xl font-medium leading-tight tracking-[-0.035em]">What did your zone invest in the crusades?</h1><p className="mt-4 leading-7 text-slate-300">Record every cost in Espees so the NOTC administration can see the full picture of what it took, zone by zone.</p></div>
      <div className="border-t border-white/20 pt-7" aria-live="polite"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Running total</p><p className="mt-2 text-4xl font-medium tabular-nums tracking-[-0.03em] transition-opacity duration-200">ES {espees.format(total)}</p><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-slate-400">Lines</dt><dd className="mt-0.5 font-semibold tabular-nums">{items.filter((i) => Number(i?.amount_espees) > 0).length}</dd></div><div><dt className="text-slate-400">Per crusade</dt><dd className="mt-0.5 font-semibold tabular-nums">{crusadeCount ? `ES ${espees.format(total / crusadeCount)}` : "—"}</dd></div>{zone && <div className="col-span-2"><dt className="text-slate-400">Zone</dt><dd className="mt-0.5 font-semibold">{zone}</dd></div>}</dl></div>
      <div className="space-y-5 border-t border-white/20 pt-7"><p className="flex gap-3 text-sm leading-6 text-slate-300"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-300" /><span>One report per zone. Reopen it any time with your zone and KingsChat username to add or correct lines.</span></p><p className="flex gap-3 text-sm leading-6 text-slate-300"><Coins className="mt-0.5 size-5 shrink-0 text-amber-300" /><span>Enter amounts in Espees. Add a note where the category alone does not explain the cost.</span></p></div></div></aside>
    <form onSubmit={handleSubmit(submit, () => toast.error("Check the highlighted details."))} className="bg-white px-5 py-12 sm:px-10 lg:px-14 lg:py-16"><div className="max-w-3xl"><p className="text-sm font-semibold text-amber-700">{editing ? `Editing · submitted ${editing.created_at.slice(0, 10)}` : "Zonal expense report"}</p><h2 className="mt-3 text-3xl font-medium leading-tight tracking-[-0.035em] sm:text-4xl">Crusade expenses for your zone</h2><p className="mt-4 max-w-2xl leading-7 text-slate-600">Zonal pastors submit one consolidated report covering all the crusades held in the zone: who you are, what the report covers, and each cost line in Espees.</p>
      {editing ? <p className="mt-5 max-w-2xl border-l-2 border-amber-500 pl-5 text-sm leading-6 text-slate-700">You are updating the existing report for <strong>{editing.zone_name}</strong>. Saving replaces its lines with what you submit below. <button type="button" onClick={startNew} className="font-semibold underline underline-offset-2">Start a different report</button></p>
        : lookingUp ? null : <p className="mt-5 max-w-2xl border-l-2 border-amber-500 pl-5 text-sm leading-6 text-slate-700">Already submitted for your zone? <button type="button" onClick={() => setLookingUp(true)} className="font-semibold underline underline-offset-2">Open your zone&rsquo;s report</button> to review or update it.</p>}
      {lookingUp && !editing && <LookupPanel fetchZones={fetchZones} onFound={loadReport} onCancel={() => setLookingUp(false)} />}

      <Section icon={MapPin} title="Zone" copy="The zone this report belongs to. One report is kept per zone."><Field label="Zone" required error={errors.zone_name?.message} className="sm:col-span-2"><Controller control={control} name="zone_name" render={({ field }) => <Combobox value={field.value} fetcher={fetchZones} onSelect={(o) => field.onChange(o.value)} disabled={Boolean(editing)} placeholder="Select your zone" caps invalid={Boolean(errors.zone_name)} />} /></Field></Section>

      <Section icon={UserRound} title="Your details" copy="Use details the NOTC administration can verify and reach directly."><Field label="Designation" required error={errors.designation?.message} className="sm:col-span-2"><Select {...register("designation")}><option value="">Select designation</option>{DESIGNATIONS.map((v) => <option key={v}>{v}</option>)}</Select></Field><Field label="First name" required error={errors.first_name?.message}><Input {...register("first_name")} autoComplete="given-name" /></Field><Field label="Last name" required error={errors.last_name?.message}><Input {...register("last_name")} autoComplete="family-name" /></Field><Field label="Email" required error={errors.email?.message}><Input type="email" {...register("email")} autoComplete="email" /></Field><Field label="KingsChat username" required hint={editing ? "Must match the username used to submit" : "You will need this to reopen the report"} error={errors.kingschat_username?.message}><Input {...register("kingschat_username")} placeholder="@username" autoComplete="off" /></Field><Field label="Phone number" required error={errors.phone_country_code?.message || errors.phone_number?.message} className="sm:col-span-2"><div className="flex gap-2"><Select className="w-28" {...register("phone_country_code")}><option value="">Code</option>{PHONE_CODES.map((v) => <option key={v}>{v}</option>)}</Select><Input type="tel" {...register("phone_number")} autoComplete="tel-national" /></div></Field></Section>

      <Section icon={CalendarRange} title="Crusades covered" copy="How many crusades this report covers and the period they were held in."><Field label="Number of crusades" required error={errors.crusade_count?.message} className="sm:col-span-2"><Input type="number" inputMode="numeric" min="1" step="1" {...register("crusade_count")} className="sm:max-w-xs" /></Field><Field label="From" required error={errors.period_from?.message}><Input type="date" {...register("period_from")} /></Field><Field label="To" required error={errors.period_to?.message}><Input type="date" {...register("period_to")} /></Field></Section>

      <section className="mt-12"><div className="flex gap-3"><Coins className="mt-1 size-5 text-amber-600" /><div><h3 className="text-2xl font-medium tracking-[-0.02em]">Expenses in Espees</h3><p className="mt-1 text-sm leading-6 text-slate-600">One line per cost. Choose the closest category; use Other with a note for anything else.</p></div></div>
        <div className="mt-6 border-y border-black/15"><div className="hidden grid-cols-[1.2fr_10rem_1fr_2.5rem] gap-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 sm:grid"><span>Category</span><span>Amount</span><span>Note</span><span className="sr-only">Remove</span></div>
          {fields.map((line, index) => { const err = errors.items?.[index]; return <div key={line.id} className="grid gap-3 border-t border-black/10 py-4 sm:grid-cols-[1.2fr_10rem_1fr_2.5rem] sm:items-start"><Field error={err?.category?.message}><Select {...register(`items.${index}.category`)} aria-label={`Line ${index + 1} category`}><option value="">Category</option>{EXPENSE_CATEGORIES.map((v) => <option key={v}>{v}</option>)}</Select></Field><Field error={err?.amount_espees?.message}><div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-slate-500">ES</span><Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" className="pl-9 tabular-nums" {...register(`items.${index}.amount_espees`)} aria-label={`Line ${index + 1} amount in Espees`} /></div></Field><Field error={err?.note?.message}><Input {...register(`items.${index}.note`)} placeholder={items[index]?.category === "Other" ? "Describe this expense" : "Optional"} aria-label={`Line ${index + 1} note`} /></Field><Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length === 1} aria-label={`Remove line ${index + 1}`} className="text-slate-500 hover:text-red-700 sm:mt-0.5"><Trash2 /></Button></div>; })}
          <div className="flex flex-col gap-4 border-t border-black/10 py-5 sm:flex-row sm:items-center sm:justify-between"><Button type="button" variant="outline" className="rounded-full active:scale-[0.96] transition-[transform,background-color] duration-150" onClick={() => append(emptyLine())}><Plus /> Add line</Button><dl className="grid grid-cols-[auto_auto] justify-end gap-x-8 gap-y-1 text-sm"><dt className="text-slate-500">Lines</dt><dd className="text-right font-semibold tabular-nums">{fields.length}</dd>{crusadeCount > 0 && <><dt className="text-slate-500">Per crusade</dt><dd className="text-right font-semibold tabular-nums">ES {espees.format(total / crusadeCount)}</dd></>}<dt className="text-base font-medium text-slate-950">Total</dt><dd className="text-right text-base font-semibold tabular-nums text-slate-950">ES {espees.format(total)}</dd></dl></div></div>
        {errors.items?.root?.message || (typeof errors.items?.message === "string" && errors.items.message) ? <p className="mt-3 text-xs font-medium text-red-700">{errors.items.root?.message || errors.items.message}</p> : null}</section>

      <section className="py-10"><Field label="Notes" hint="Anything the administration should know about these costs."><Textarea rows={4} {...register("notes")} /></Field><div className="mt-8 flex flex-col-reverse gap-4 border-t border-black/10 pt-8 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-xs leading-5 text-slate-500">Amounts are recorded as submitted. Reopen the report with your zone and KingsChat username to correct anything.</p><Button type="submit" disabled={isSubmitting} className="rounded-full bg-[#18234d] px-7 hover:bg-[#24346d] active:scale-[0.96] transition-[transform,background-color] duration-150">{isSubmitting ? "Saving…" : editing ? "Update expense report" : "Submit expense report"}</Button></div></section>
    </div></form></main></div>;
}
