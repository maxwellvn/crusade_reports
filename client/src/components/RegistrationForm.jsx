import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Loader2, Check, ArrowLeft, ArrowRight, ArrowUpRight, Trash2, X } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Combobox } from "@/components/Combobox";
import { CollaboratorPicker, ContributionChecklist } from "@/components/CollaborationFields";
import { getJSON, postJSON } from "@/lib/api";
import { registrationSchema, registrationDefaults } from "@/lib/schema";
import { CRUSADE_TYPES, PERMIT_OPTIONS, PHONE_CODES } from "@/lib/constants";
import { nfull, typeLabel } from "@/lib/dashboardWidgets";
import { useOrgData, Stepper, Summary } from "@/lib/orgForm";
import "../landing.css"; // campaign fonts; reg theme lives in the .reg-page block

// Public crusade registration — the intent-side twin of the report form.
// Crusades are added one at a time; each click creates one required detail record.
// The API still receives individual items, never an unaccounted aggregate.

const STEPS = ["Who you are", "Your crusades", "Review"];
const DRAFT_KEY = "crusade-registration-draft-v1";
const clearStoredDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ } };
const STEP_FIELDS = [
  ["organization_type", "zone", "group_name", "church_name", "cell_name", "network_name", "country",
    "contact_name", "contact_email", "phone_country_code", "phone_number"],
  ["items"],
  [],
];

function MinisterTags({ value = "", onChange, invalid }) {
  const split = (names) => names.split(",").map((name) => name.trim()).filter(Boolean);
  const [tags, setTags] = React.useState(() => split(value));
  const [draft, setDraft] = React.useState("");
  const previousValue = React.useRef(value);

  React.useEffect(() => {
    if (value !== previousValue.current) {
      previousValue.current = value;
      setTags(split(value));
      setDraft("");
    }
  }, [value]);

  function update(next) {
    setTags(next);
    onChange(next.join(", "));
  }
  function add(names = draft) {
    const next = [...tags, ...split(names)];
    if (next.length !== tags.length) update(next);
    setDraft("");
  }
  function changeDraft(next) {
    const parts = next.split(",");
    if (parts.length === 1) return setDraft(next);
    add(parts.slice(0, -1).join(","));
    setDraft(parts.at(-1));
  }

  return (
    <div className={`flex min-h-10 flex-wrap items-center gap-1.5 border-b border-input py-1 focus-within:border-foreground ${invalid ? "border-foreground" : ""}`}>
      {tags.map((name, i) => (
        <span key={`${name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
          {name}
          <button type="button" onClick={() => update(tags.filter((_, index) => index !== i))} className="rounded-full p-0.5 hover:bg-foreground/10" aria-label={`Remove ${name}`}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input value={draft} onChange={(e) => changeDraft(e.target.value)} onBlur={() => add()}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(); }
          if (e.key === "Backspace" && !draft && tags.length) update(tags.slice(0, -1));
        }}
        aria-invalid={invalid} placeholder={tags.length ? "Add another minister" : "e.g. Pastor John Doe"}
        className="min-w-36 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground" />
    </div>
  );
}

export function RegistrationForm() {
  const form = useForm({ resolver: zodResolver(registrationSchema), defaultValues: registrationDefaults, mode: "onBlur" });
  const { register, handleSubmit, control, watch, getValues, setValue, reset, trigger, formState: { errors, isSubmitting } } = form;
  const draftReady = React.useRef(false);
  const [searchParams] = useSearchParams();
  const portalToken = searchParams.get("portal") || "";
  const [portalScope, setPortalScope] = React.useState(null);
  const [portalError, setPortalError] = React.useState("");

  const [step, setStep] = React.useState(0);
  const [done, setDone] = React.useState(null);
  const [batchType, setBatchType] = React.useState("");
  const [selectedCrusades, setSelectedCrusades] = React.useState([]);
  const orgType = watch("organization_type");
  const zone = watch("zone");
  const country = watch("country");
  const items = watch("items");

  const needsZone = ["zone", "group", "church", "cell"].includes(orgType);
  const needsGroup = ["group", "church", "cell"].includes(orgType);
  const needsChurch = ["church", "cell"].includes(orgType);
  const needsCell = orgType === "cell";

  const [countryCode, setCountryCode] = React.useState("");
  const { fetchCountries, fetchCities, fetchZones, fetchGroups, fetchNetworks, fetchCollaborators, clearGroupCache } = useOrgData(zone, countryCode);
  const itemArray = useFieldArray({ control, name: "items" });

  const totalPlanned = (items || []).length;

  function applyScope(scope) {
    if (!scope) return;
    setValue("organization_type", scope.kind === "network" ? "network" : "zone", { shouldValidate: true });
    setValue("zone", scope.kind === "zone" ? scope.zone : "", { shouldValidate: true });
    setValue("network_name", scope.kind === "network" ? scope.zone : "", { shouldValidate: true });
  }

  React.useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (draft?.values && typeof draft.values === "object") {
        reset({ ...registrationDefaults, ...draft.values, items: Array.isArray(draft.values.items) ? draft.values.items : [] });
        setStep(Math.min(Math.max(Number(draft.step) || 0, 0), STEPS.length - 1));
        setBatchType(draft.batchType || "");
        setCountryCode(draft.countryCode || "");
        toast.success("Your saved registration draft has been restored.");
      }
    } catch {
      clearStoredDraft();
    }
    draftReady.current = true;
  }, [reset]);

  React.useEffect(() => {
    if (!portalToken) return;
    getJSON(`/zone-portal/${encodeURIComponent(portalToken)}`)
      .then((scope) => { setPortalScope(scope); applyScope(scope); })
      .catch((error) => setPortalError(error.message));
  }, [portalToken]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!draftReady.current || done) return;
    let timer;
    const save = () => {
      try {
        const values = getValues();
        const hasProgress = Object.values(values).some((value) => Array.isArray(value) ? value.length > 0 : String(value || "").trim());
        if (!hasProgress && !batchType) return clearStoredDraft();
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, step, batchType, countryCode, savedAt: Date.now() }));
      } catch { /* storage may be unavailable or full */ }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(save, 250); };
    schedule();
    const subscription = watch(schedule);
    return () => { clearTimeout(timer); subscription.unsubscribe(); };
  }, [watch, getValues, step, batchType, countryCode, done]);

  // ---- Handlers --------------------------------------------------------------
  async function next() {
    const ok = await trigger(STEP_FIELDS[step]);
    if (!ok) return toast.error("Please fix the highlighted fields.");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function onFormKeyDown(e) {
    if (e.key !== "Enter" || step === STEPS.length - 1) return;
    if (step === 1 && e.target.closest("[data-crusade-generator]")) {
      e.preventDefault();
      addCrusade();
      return;
    }
    e.preventDefault();
    if (e.target.closest("[cmdk-root]")) return;
    next();
  }

  function addCrusade(type = batchType) {
    if (!type) return toast.error("Select the crusade type.");
    if (itemArray.fields.length >= 500) return toast.error("Maximum of 500 crusades per registration.");
    itemArray.append({
      event_type: type, event_name: "", event_date: "", venue: "", expected_attendance: "", minister_name: "", city: "", city_place_id: "",
      crusade_collaborators: [], zone_contribution: [],
      estimated_budget: "", rhapsody_copies_confirmed: "", permits_obtained: "", media_coverage_plan: "",
    });
    toast.success(`${typeLabel(type)} detail form added.`);
  }

  function removeCrusades(indices) {
    const list = Array.isArray(indices) ? indices : [indices];
    itemArray.remove(list);
    setSelectedCrusades([]);
    toast.success(`${list.length} crusade detail field${list.length === 1 ? "" : "s"} removed.`);
  }

  async function onSubmit(data) {
    if (step !== STEPS.length - 1) return;
    try {
      await postJSON("/registrations", { ...data, portal_token: portalToken || undefined });
      clearStoredDraft();
      setDone({ planned: totalPlanned });
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error(e.message);
    }
  }

  function registerAnother() {
    clearStoredDraft();
    reset(registrationDefaults);
    setCountryCode("");
    setBatchType("");
    setSelectedCrusades([]);
    setStep(0);
    setDone(null);
    applyScope(portalScope);
  }

  function discardDraft() {
    clearStoredDraft();
    reset(registrationDefaults);
    setCountryCode("");
    setBatchType("");
    setSelectedCrusades([]);
    setStep(0);
    applyScope(portalScope);
    toast.success("Saved draft cleared.");
  }

  return (
    <div className="reg-page">
      {/* Pill header, campaign style */}
      <header className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="reg-header mx-auto flex h-14 max-w-3xl items-center justify-between rounded-full pl-3 pr-4 backdrop-blur-md">
          <Link to="/crusade-registration" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Rhapsody End-Time Teaching Crusades" className="h-8 w-auto" />
            <span className="hidden text-sm font-semibold sm:block">A Night of a Thousand Crusades</span>
          </Link>
          <a href="https://rhapsodycrusades.org" target="_blank" rel="noreferrer"
            className="reg-header-link inline-flex items-center gap-1 text-sm font-semibold transition-colors">
            rhapsodycrusades.org <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </header>

      <main className="reg-main">
       <div className="reg-card">
        {portalError ? (
          <div className="space-y-4 py-16 text-center">
            <h1 className="reg-title text-3xl">This dashboard link is not valid.</h1>
            <p className="text-sm text-muted-foreground">{portalError}</p>
          </div>
        ) : done ? (
          <div className="animate-step-in space-y-6 pb-24 text-center motion-reduce:animate-none">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-8" /></span>
            <h1 className="reg-title text-4xl tracking-[-0.9px]">You’re registered.</h1>
            <p className="mx-auto max-w-md text-muted-foreground">
              <span className="font-semibold text-foreground">{nfull.format(done.planned)} individual crusades</span> have joined the global tally.
              Thank you — now go make them happen.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button type="button" onClick={registerAnother}>Register another organization</Button>
              <Button type="button" variant="outline" asChild><Link to="/crusade-registration">Back to campaign page</Link></Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit, () => toast.error("Please fix the highlighted fields."))} onKeyDown={onFormKeyDown} className="space-y-6 pb-28">
            <div className="space-y-2">
              <p className="reg-eyebrow text-sm font-semibold uppercase tracking-[0.35px]">Crusade Registration</p>
              <h1 className="reg-title text-3xl tracking-[-0.9px] sm:text-4xl">Register your crusades.</h1>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <p>Your progress is saved automatically in this browser, even while offline.</p>
                <button type="button" onClick={discardDraft} className="font-medium text-foreground underline underline-offset-4">Discard saved draft</button>
              </div>
            </div>

            {portalScope && <Card><CardContent className="pt-6">
              <p className="text-sm font-medium">Registering crusades for {portalScope.zone}</p>
              <p className="text-xs text-muted-foreground">These crusades will be assigned to this {portalScope.kind} dashboard.</p>
            </CardContent></Card>}

            <Stepper steps={STEPS} step={step} />

            <div key={step} className="animate-step-in space-y-6 motion-reduce:animate-none">
              {step === 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Who is registering?</CardTitle>
                    <CardDescription>Tell us which organization these crusades belong to.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Field label="Registering as" required error={errors.organization_type?.message}>
                      <Select {...register("organization_type")} aria-invalid={!!errors.organization_type} disabled={!!portalScope}
                        onChange={(e) => setValue("organization_type", e.target.value, { shouldValidate: true })}>
                        <option value="">Select…</option>
                        <option value="zone">Zone</option>
                        <option value="group">Group</option>
                        <option value="church">Church</option>
                        <option value="cell">Cell</option>
                        <option value="network">Network</option>
                      </Select>
                    </Field>

                    {needsZone && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Zone" required error={errors.zone?.message}>
                          {portalScope ? <Input value={portalScope.zone} readOnly /> : <Controller control={control} name="zone" render={({ field }) => (
                            <Combobox value={field.value} invalid={!!errors.zone} caps placeholder="Select zone" searchPlaceholder="Search zones…" emptyText="No zones"
                              fetcher={fetchZones} onSelect={(o) => { field.onChange(o.value); setValue("group_name", ""); clearGroupCache(); }} />
                          )} />}
                        </Field>
                        {needsGroup && (
                          <Field label="Group" required error={errors.group_name?.message}>
                            <Controller control={control} name="group_name" render={({ field }) => (
                              <Combobox value={field.value} invalid={!!errors.group_name} caps disabled={!zone}
                                placeholder={zone ? "Select group" : "Pick a zone first"} searchPlaceholder="Search groups…" emptyText="No groups"
                                fetcher={fetchGroups} onSelect={(o) => field.onChange(o.label)} />
                            )} />
                          </Field>
                        )}
                        {needsChurch && (
                          <Field label="Church name" required error={errors.church_name?.message} className={needsCell ? "" : "sm:col-span-2"}>
                            <Input {...register("church_name")} aria-invalid={!!errors.church_name} placeholder="e.g. Christ Embassy Lekki" />
                          </Field>
                        )}
                        {needsCell && (
                          <Field label="Cell name" required error={errors.cell_name?.message}>
                            <Input {...register("cell_name")} aria-invalid={!!errors.cell_name} placeholder="e.g. Victory Cell" />
                          </Field>
                        )}
                      </div>
                    )}

                    {orgType === "network" && (
                      <Field label="Network" required error={errors.network_name?.message}>
                        {portalScope ? <Input value={portalScope.zone} readOnly /> : <Controller control={control} name="network_name" render={({ field }) => (
                          <Combobox value={field.value} invalid={!!errors.network_name} caps placeholder="Select network" searchPlaceholder="Search networks…"
                            emptyText="No networks found" fetcher={fetchNetworks} onSelect={(o) => field.onChange(o.value)} />
                        )} />}
                      </Field>
                    )}

                    <div>
                      <Field label="Country" required error={errors.country?.message} hint="Where these crusades will hold">
                        <Controller control={control} name="country" render={({ field }) => (
                          <Combobox value={field.value} invalid={!!errors.country} placeholder="Select or search country" searchPlaceholder="Scroll or type a country…"
                            minChars={0} emptyText="No countries found" fetcher={fetchCountries}
                            onSelect={(o) => { setValue("country", o.label, { shouldValidate: true }); setCountryCode(o.value); }} />
                        )} />
                      </Field>
                    </div>

                    <div className="border-t pt-4">
                      <p className="mb-3 text-sm font-medium">Your contact details</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Full name" required error={errors.contact_name?.message}>
                          <Input autoComplete="name" {...register("contact_name")} aria-invalid={!!errors.contact_name} placeholder="Your full name" />
                        </Field>
                        <Field label="Email address" required error={errors.contact_email?.message}>
                          <Input type="email" autoComplete="email" {...register("contact_email")} aria-invalid={!!errors.contact_email} placeholder="you@example.com" />
                        </Field>
                        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[120px_1fr]">
                          <Field label="Code" required error={errors.phone_country_code?.message}>
                            <Select autoComplete="tel-country-code" {...register("phone_country_code")} aria-invalid={!!errors.phone_country_code}>
                              <option value="">Code</option>
                              {PHONE_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
                            </Select>
                          </Field>
                          <Field label="Phone number" required error={errors.phone_number?.message}>
                            <Input type="tel" autoComplete="tel-national" {...register("phone_number")} aria-invalid={!!errors.phone_number} placeholder="801 234 5678" />
                          </Field>
                        </div>
                        <Field label="KingsChat username (optional)" error={errors.kingschat_username?.message} className="sm:col-span-2">
                          <Input {...register("kingschat_username")} aria-invalid={!!errors.kingschat_username} placeholder="@username" />
                        </Field>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Register each individual crusade</CardTitle>
                    <CardDescription>
                      Enter only crusades you have confirmed. Select the type and add crusades one by one; each adds one required detail form. You cannot continue until all are complete.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {typeof errors.items?.message === "string" && <p className="text-xs font-medium">{errors.items.message}</p>}
                    <div data-crusade-generator className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <Field label="Crusade type" required>
                        <Select value={batchType} onChange={(e) => setBatchType(e.target.value)}>
                          <option value="">Select…</option>
                          {CRUSADE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </Select>
                      </Field>
                      <Button type="button" onClick={() => addCrusade()}>
                        <Plus /> {itemArray.fields.length > 0 ? "Add another crusade" : "Add crusade"}
                      </Button>
                    </div>

                    {itemArray.fields.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3 text-sm">
                        <p><span className="font-semibold">{nfull.format(itemArray.fields.length)}</span> confirmed crusade detail form{itemArray.fields.length === 1 ? "" : "s"} to complete.</p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCrusades(
                            selectedCrusades.length === itemArray.fields.length ? [] : itemArray.fields.map((field) => field.id)
                          )}>
                            {selectedCrusades.length === itemArray.fields.length ? "Clear selection" : "Select all"}
                          </Button>
                          {selectedCrusades.length > 0 && (
                            <Button type="button" variant="outline" size="sm" onClick={() => removeCrusades(
                              itemArray.fields.map((field, index) => selectedCrusades.includes(field.id) ? index : -1).filter((index) => index >= 0)
                            )}>
                              <Trash2 /> Remove selected ({selectedCrusades.length})
                            </Button>
                          )}
                          <Button type="button" variant="ghost" size="sm" onClick={() => { itemArray.replace([]); setSelectedCrusades([]); }}>Start over</Button>
                        </div>
                      </div>
                    )}
                    {itemArray.fields.map((f, i) => {
                      const rowErr = errors.items?.[i] || {};
                      return (
                        <div key={f.id} className="animate-step-in rounded-lg border border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm motion-reduce:animate-none">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <label className="flex items-center gap-2 font-medium">
                              <input type="checkbox" checked={selectedCrusades.includes(f.id)} onChange={(event) => setSelectedCrusades((current) =>
                                event.target.checked ? [...current, f.id] : current.filter((id) => id !== f.id)
                              )} className="size-4 accent-primary" />
                              Crusade {i + 1} of {itemArray.fields.length}
                            </label>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">{typeLabel(items?.[i]?.event_type || f.event_type)}</span>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeCrusades(i)} aria-label={`Remove crusade ${i + 1}`}>
                                <Trash2 />
                              </Button>
                            </div>
                          </div>
                          <input type="hidden" {...register(`items.${i}.event_type`)} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Crusade name" required error={rowErr.event_name?.message}>
                              <Input placeholder="e.g. Lekki Community Crusade" {...register(`items.${i}.event_name`)} aria-invalid={!!rowErr.event_name} />
                            </Field>
                            <Field label="Crusade date" required error={rowErr.event_date?.message}>
                              <Input type="date" {...register(`items.${i}.event_date`)} aria-invalid={!!rowErr.event_date} />
                            </Field>
                            <Field label="Expected attendance" required error={rowErr.expected_attendance?.message}>
                              <Input type="number" min="1" placeholder="e.g. 500" {...register(`items.${i}.expected_attendance`)} aria-invalid={!!rowErr.expected_attendance} />
                            </Field>
                            <Field label="City" required error={rowErr.city?.message}>
                              <Controller control={control} name={`items.${i}.city`} render={({ field }) => (
                                <Combobox value={field.value} disabled={!country}
                                  placeholder={country ? "Search city" : "Pick a country first"} searchPlaceholder="Type a city…" minChars={1} emptyText="No cities found"
                                  fetcher={fetchCities} onSelect={(o) => { field.onChange(o.label); setValue(`items.${i}.city_place_id`, o.value); }} />
                              )} />
                            </Field>
                            <Field label="Venue / address" required error={rowErr.venue?.message} className="sm:col-span-2">
                              <Input placeholder="e.g. City Stadium, 10 Main Road" {...register(`items.${i}.venue`)} aria-invalid={!!rowErr.venue} />
                            </Field>
                          </div>
                          <Field label="Ministers' names" required error={rowErr.minister_name?.message} className="mt-3" hint="Type a name and press comma to add another minister">
                            <Controller control={control} name={`items.${i}.minister_name`} render={({ field }) => (
                              <MinisterTags value={field.value} onChange={field.onChange} invalid={!!rowErr.minister_name} />
                            )} />
                          </Field>
                          {orgType === "network" && (
                            <div className="mt-4 space-y-4 border-t border-dashed pt-4">
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Who are the crusade collaborators?" hint="Zones or networks partnering on this crusade">
                                  <Controller control={control} name={`items.${i}.crusade_collaborators`} render={({ field }) => (
                                    <CollaboratorPicker value={field.value} onChange={field.onChange} fetcher={fetchCollaborators} />
                                  )} />
                                </Field>
                                <Field label="Zone’s contribution to crusade" hint="Select all that apply">
                                  <Controller control={control} name={`items.${i}.zone_contribution`} render={({ field }) => (
                                    <ContributionChecklist value={field.value} onChange={field.onChange} />
                                  )} />
                                </Field>
                              </div>
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Estimated crusade budget">
                                  <Input placeholder="e.g. 2,000,000" {...register(`items.${i}.estimated_budget`)} />
                                </Field>
                                <Field label="Number of Rhapsody copies confirmed">
                                  <Input type="number" min="0" placeholder="e.g. 5,000" {...register(`items.${i}.rhapsody_copies_confirmed`)} />
                                </Field>
                                <Field label="Have the required permits been obtained? (where applicable)">
                                  <Select {...register(`items.${i}.permits_obtained`)}>
                                    <option value="">Select…</option>
                                    {PERMIT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                                  </Select>
                                </Field>
                                <Field label="Specify your media coverage plan" className="sm:col-span-2">
                                  <Textarea rows={3} maxLength={2000} placeholder="TV, radio, social media, press…" {...register(`items.${i}.media_coverage_plan`)} />
                                </Field>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {itemArray.fields.length > 0 && (
                      <Button type="button" variant="outline" className="w-full" onClick={() => addCrusade(batchType || items?.[items.length - 1]?.event_type)}>
                        <Plus /> Add another crusade
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {step === 2 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Review your registration</CardTitle>
                    <CardDescription>Check the details, then submit to join the global tally.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <Summary label="Registering as" value={orgType || "—"} />
                      <Summary label="Country" value={country || "—"} />
                      {zone && <Summary label="Zone" value={zone} />}
                      {watch("group_name") && <Summary label="Group" value={watch("group_name")} />}
                      {watch("church_name") && <Summary label="Church" value={watch("church_name")} />}
                      {watch("cell_name") && <Summary label="Cell" value={watch("cell_name")} />}
                      {watch("network_name") && <Summary label="Network" value={watch("network_name")} />}
                      <Summary label="Contact name" value={watch("contact_name") || "—"} />
                      <Summary label="Email" value={watch("contact_email") || "—"} />
                      <Summary label="Phone" value={`${watch("phone_country_code") || ""} ${watch("phone_number") || ""}`.trim() || "—"} />
                      <Summary label="KingsChat" value={watch("kingschat_username") || "—"} />
                      <Summary label="Total crusades" value={nfull.format(totalPlanned)} />
                    </div>
                    <div className="divide-y rounded-lg border">
                      {(items || []).map((it, i) => (
                        <div key={i} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{it.event_name || typeLabel(it.event_type)} · {it.city} · {it.venue} · {nfull.format(+it.expected_attendance || 0)} expected</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{it.event_date}</span>
                          </div>
                          {it.crusade_collaborators?.length > 0 && (
                            <div className="mt-1 text-xs text-muted-foreground">Collaborators: {it.crusade_collaborators.join(", ")}</div>
                          )}
                          {it.zone_contribution?.length > 0 && (
                            <div className="mt-0.5 text-xs text-muted-foreground">Contribution: {it.zone_contribution.join(", ")}</div>
                          )}
                          {it.estimated_budget && <div className="mt-0.5 text-xs text-muted-foreground">Budget: {it.estimated_budget}</div>}
                          {it.rhapsody_copies_confirmed && <div className="mt-0.5 text-xs text-muted-foreground">Rhapsody copies: {it.rhapsody_copies_confirmed}</div>}
                          {it.permits_obtained && <div className="mt-0.5 text-xs text-muted-foreground">Permits obtained: {it.permits_obtained}</div>}
                          {it.media_coverage_plan && <div className="mt-0.5 text-xs text-muted-foreground">Media plan: {it.media_coverage_plan}</div>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sticky bar: live total + navigation */}
            <div className="fixed inset-x-0 bottom-0 border-t bg-card/90 backdrop-blur">
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-4">
                  {step > 0 && <Button type="button" variant="ghost" onClick={back}><ArrowLeft /> Back</Button>}
                  <span className="text-sm text-muted-foreground">
                    {totalPlanned > 0
                      ? <><span className="font-semibold text-foreground tabular-nums">{nfull.format(totalPlanned)}</span> crusade{totalPlanned === 1 ? "" : "s"} planned</>
                      : `Step ${step + 1} of ${STEPS.length}`}
                  </span>
                </div>
                {step < STEPS.length - 1 ? (
                  <Button key="next" type="button" size="lg" onClick={next}>Next <ArrowRight /></Button>
                ) : (
                  <Button key="submit" type="submit" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? <><Loader2 className="animate-spin" /> Submitting…</> : "Submit registration"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        )}
       </div>
      </main>
    </div>
  );
}
