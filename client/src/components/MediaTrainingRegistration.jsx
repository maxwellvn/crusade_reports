/* THESIS: One trainee completes one focused registration. OWN-WORLD: campaign navy, electric blue, white ruled form. STORY: identify your zone and media role, provide direct contact details, submit. FORM: individual registration sheet, seed 1af02673. */
import * as React from "react";
import { Link } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Check, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/Combobox";
import { postJSON } from "@/lib/api";
import { PHONE_CODES } from "@/lib/constants";
import { mediaTrainingRegistrationSchema } from "@/lib/schema";
import { useOrgData } from "@/lib/orgForm";

const ROLES = ["Presenter", "Cameraman", "Technical Personnel", "Other"];

function Confirmation({ result }) {
  return <div className="min-h-screen bg-white">
    <header className="border-b border-slate-200"><div className="mx-auto flex max-w-5xl items-center px-4 py-4 sm:px-6"><img src="/logo.png" alt="" className="h-11" /><Link to="/" className="ml-auto text-sm font-semibold text-slate-700">Return home</Link></div></header>
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24"><span className="grid size-12 place-items-center rounded-full bg-slate-950 text-white"><Check /></span><p className="mt-8 text-sm font-semibold text-blue-700">Registration received</p><h1 className="mt-3 text-4xl font-normal tracking-[-0.03em] text-slate-950 sm:text-5xl">You are registered.</h1><p className="mt-5 max-w-2xl leading-7 text-slate-600">{result.full_name}, your place in the Global Media Training on August 24, 2026 has been recorded.</p>
      <dl className="mt-10 border-y border-slate-200">{[["Zone", result.zone_name], result.group_name && ["Group", result.group_name], result.church_name && ["Church", result.church_name], ["Reference number", result.reference_code]].filter(Boolean).map(([label, value]) => <div key={label} className="grid gap-1 border-b border-slate-200 py-4 last:border-0 sm:grid-cols-[12rem_1fr]"><dt className="text-sm text-slate-500">{label}</dt><dd className="text-sm font-semibold">{value}</dd></div>)}</dl>
      <Button className="mt-8 rounded-full" onClick={() => window.location.reload()}>Register another person</Button>
    </main>
  </div>;
}

export function MediaTrainingRegistration() {
  const [result, setResult] = React.useState(null);
  const { register, control, setValue, watch, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(mediaTrainingRegistrationSchema), defaultValues: { zone_name: "", group_name: "", church_name: "", full_name: "", role: "", other_role: "", email: "", kingschat_username: "", phone_country_code: "", phone_number: "" }, mode: "onBlur" });
  const zoneName = watch("zone_name");
  const role = watch("role");
  const { fetchZones, fetchGroups, clearGroupCache } = useOrgData(zoneName);
  async function submit(data) { try { setResult(await postJSON("/media-training/registrations", data)); window.scrollTo({ top: 0 }); } catch (error) { toast.error(error.message); } }
  if (result) return <Confirmation result={result} />;

  return <div className="min-h-screen bg-white">
    <header className="border-b border-slate-200"><div className="mx-auto flex max-w-6xl items-center px-4 py-4 sm:px-6"><Link to="/" aria-label="A Night of a Thousand Crusades home"><img src="/logo.png" alt="" className="h-11" /></Link><Link to="/" className="ml-auto text-sm font-semibold text-slate-700">Return home</Link></div></header>
    <main className="mx-auto grid max-w-6xl lg:grid-cols-[21rem_minmax(0,1fr)]">
      <aside className="bg-slate-950 px-5 py-10 text-white sm:px-8 lg:min-h-[calc(100vh-77px)] lg:py-14"><p className="text-sm font-semibold text-blue-300">Global Media Training</p><h1 className="mt-4 text-4xl font-normal leading-[1.03] tracking-[-0.03em]">Prepare for the work behind every broadcast.</h1><div className="mt-10 space-y-5 border-t border-slate-700 pt-6 text-sm"><p className="flex gap-3"><CalendarDays className="size-5 text-blue-300" /><span><strong className="block text-white">August 24, 2026</strong><span className="text-slate-400">Global training day</span></span></p><p className="flex gap-3"><UserRound className="size-5 text-blue-300" /><span><strong className="block text-white">Individual registration</strong><span className="text-slate-400">Each trainee completes this form personally</span></span></p></div></aside>
      <form onSubmit={handleSubmit(submit, () => toast.error("Check the highlighted registration details."))} className="px-4 py-10 sm:px-10 sm:py-14"><div className="max-w-3xl"><p className="text-sm font-semibold text-blue-700">Trainee registration</p><h2 className="mt-3 text-3xl font-normal tracking-[-0.03em] text-slate-950">Register for the training.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Tell us where you serve, your media role, and how the training team can reach you.</p>
        <section className="mt-10 grid gap-6 border-y border-slate-200 py-8 sm:grid-cols-2"><Field label="Zone" required error={errors.zone_name?.message}><Controller control={control} name="zone_name" render={({ field }) => <Combobox value={field.value} fetcher={fetchZones} onSelect={(option) => { field.onChange(option.value); setValue("group_name", ""); clearGroupCache(); }} placeholder="Select your zone" searchPlaceholder="Search zones…" invalid={Boolean(errors.zone_name)} caps />} /></Field><Field label="Group" hint="Optional — leave blank if you serve at the zonal church"><Controller control={control} name="group_name" render={({ field }) => <Combobox value={field.value} fetcher={fetchGroups} onSelect={(option) => field.onChange(option.label)} disabled={!zoneName} placeholder={zoneName ? "Select your group, if applicable" : "Select a zone first"} searchPlaceholder="Search groups…" caps />} /></Field><Field label="Church name" htmlFor="media-church" hint="Optional — enter your local or group church" className="sm:col-span-2"><Input id="media-church" {...register("church_name")} placeholder="e.g. Christ Embassy Lekki" /></Field></section>
        <section className="pt-10"><h3 className="text-xl font-medium text-slate-950">Your details</h3><p className="mt-1 text-sm text-slate-600">Use contact information you check regularly.</p><div className="mt-6 grid gap-5 border-y border-slate-200 py-8 sm:grid-cols-2"><Field label="Full name" htmlFor="media-name" required error={errors.full_name?.message}><Input id="media-name" {...register("full_name")} aria-invalid={Boolean(errors.full_name)} placeholder="Full name" /></Field><Field label="Role" htmlFor="media-role" required error={errors.role?.message}><Select id="media-role" {...register("role")} aria-invalid={Boolean(errors.role)}><option value="">Select role</option>{ROLES.map((item) => <option key={item}>{item}</option>)}</Select></Field>{role === "Other" && <Field label="Your media role" htmlFor="media-other-role" required error={errors.other_role?.message} className="sm:col-span-2"><Input id="media-other-role" {...register("other_role")} aria-invalid={Boolean(errors.other_role)} placeholder="Enter your role" autoFocus /></Field>}<Field label="Email" htmlFor="media-email" required error={errors.email?.message}><Input id="media-email" type="email" {...register("email")} aria-invalid={Boolean(errors.email)} placeholder="name@example.com" /></Field><Field label="KingsChat username" htmlFor="media-kc" required error={errors.kingschat_username?.message}><Input id="media-kc" {...register("kingschat_username")} aria-invalid={Boolean(errors.kingschat_username)} placeholder="@username" /></Field><Field label="Phone number" htmlFor="media-phone" required error={errors.phone_country_code?.message || errors.phone_number?.message} className="sm:col-span-2"><div className="flex gap-2"><Select className="w-28 shrink-0" {...register("phone_country_code")} aria-invalid={Boolean(errors.phone_country_code)} aria-label="Phone country code"><option value="">Code</option>{PHONE_CODES.map((code) => <option key={code}>{code}</option>)}</Select><Input id="media-phone" type="tel" {...register("phone_number")} aria-invalid={Boolean(errors.phone_number)} placeholder="Phone number" /></div></Field></div><div className="flex flex-col-reverse gap-3 py-8 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">Review your contact details before submitting.</p><Button type="submit" disabled={isSubmitting} className="rounded-full px-6">{isSubmitting ? "Submitting registration…" : "Register for training"}</Button></div></section>
      </div></form>
    </main>
  </div>;
}
