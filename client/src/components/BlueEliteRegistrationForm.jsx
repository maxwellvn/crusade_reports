import * as React from "react";
import { Link } from "react-router-dom";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Loader2, Check, ArrowLeft, ArrowRight, ArrowUpRight, Trash2, X } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Combobox } from "@/components/Combobox";
import { getJSON, postJSON } from "@/lib/api";
import { blueEliteRegistrationSchema, blueEliteRegistrationDefaults } from "@/lib/schema";
import { CRUSADE_TYPES, PHONE_CODES } from "@/lib/constants";
import { nfull, typeLabel } from "@/lib/dashboardWidgets";
import { useOrgData, Stepper, Summary } from "@/lib/orgForm";
import { citySelectionFields } from "@/lib/citySelection";
import "../landing.css";

// Loveworld Blue Elite staff registration — same per-crusade shape as the public
// /crusade-registration form, but the organization side is fixed (zone with
// optional group/church, no cell/network selector) and staff must supply a department and a
// KingsChat username. Submissions hit /api/blue-elite/registrations and are
// tagged program='blue_elite' server-side so they stay out of the public
// dashboard and the zone portals.

const STEPS = ["Who you are", "Your crusades", "Review"];
const DRAFT_KEY = "blue-elite-registration-draft-v1";
const clearStoredDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ } };
const STEP_FIELDS = [
  ["zone", "group_name", "church_name", "department", "contact_name", "contact_email", "phone_country_code", "phone_number", "kingschat_username"],
  ["items"],
  [],
];

const CRUSADE_DETAIL_FIELDS = ["event_name", "event_date", "venue", "expected_attendance", "country", "city", "minister_name"];
const isCrusadeUntouched = (item) => !!item && CRUSADE_DETAIL_FIELDS.every((key) => !String(item[key] ?? "").trim());

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

  function update(next) { setTags(next); onChange(next.join(", ")); }
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

export function BlueEliteRegistrationForm() {
  const form = useForm({ resolver: zodResolver(blueEliteRegistrationSchema), defaultValues: blueEliteRegistrationDefaults, mode: "onBlur" });
  const { register, handleSubmit, control, watch, getValues, setValue, reset, trigger, formState: { errors, isSubmitting } } = form;
  const draftReady = React.useRef(false);

  const [step, setStep] = React.useState(0);
  const [done, setDone] = React.useState(null);
  const [batchType, setBatchType] = React.useState("");
  const [selectedCrusades, setSelectedCrusades] = React.useState([]);
  const zone = watch("zone");
  const items = watch("items");

  const { fetchCountries, countryCodeOf, fetchZones, fetchGroups, clearGroupCache } = useOrgData(zone);
  const cityFetcherFor = React.useCallback((countryName) => {
    const code = countryCodeOf(countryName);
    return async (query) => {
      const results = await getJSON(`/places/autocomplete?input=${encodeURIComponent(query)}${code ? `&country=${code}` : ""}`);
      return results.map((place) => ({ value: place.place_id, label: place.main, sublabel: place.secondary }));
    };
  }, [countryCodeOf]);
  const itemArray = useFieldArray({ control, name: "items" });

  const totalPlanned = (items || []).length;

  React.useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (draft?.values && typeof draft.values === "object") {
        reset({ ...blueEliteRegistrationDefaults, ...draft.values, items: Array.isArray(draft.values.items) ? draft.values.items : [] });
        setStep(Math.min(Math.max(Number(draft.step) || 0, 0), STEPS.length - 1));
        setBatchType(draft.batchType || "");
        toast.success("Your saved Blue Elite draft has been restored.");
      }
    } catch {
      clearStoredDraft();
    }
    draftReady.current = true;
  }, [reset]);

  React.useEffect(() => {
    if (!draftReady.current || done) return;
    let timer;
    const save = () => {
      try {
        const values = getValues();
        const hasProgress = Object.values(values).some((value) => Array.isArray(value) ? value.length > 0 : String(value || "").trim());
        if (!hasProgress && !batchType) return clearStoredDraft();
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, step, batchType, savedAt: Date.now() }));
      } catch { /* storage may be unavailable or full */ }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(save, 250); };
    schedule();
    const subscription = watch(schedule);
    return () => { clearTimeout(timer); subscription.unsubscribe(); };
  }, [watch, getValues, step, batchType, done]);

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
    if (!type) {
      toast.error("Select the crusade type first.");
      document.querySelector("[data-crusade-generator]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (itemArray.fields.length >= 500) return toast.error("Maximum of 500 crusades per registration.");
    const current = getValues("items") || [];
    const lastIndex = current.length - 1;
    if (lastIndex >= 0 && isCrusadeUntouched(current[lastIndex])) {
      toast.error("Fill in the crusade you just added before adding another.");
      document.getElementById(`crusade-card-${lastIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    itemArray.append({
      event_type: type, event_name: "", event_date: "", venue: "", expected_attendance: "", minister_name: "", country: "", city: "", city_place_id: "",
    });
    toast.success(`${typeLabel(type)} detail form added.`);
    setBatchType("");
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
      await postJSON("/blue-elite/registrations", data);
      clearStoredDraft();
      setDone({ planned: totalPlanned });
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error(e.message);
    }
  }

  function registerAnother() {
    clearStoredDraft();
    reset(blueEliteRegistrationDefaults);
    setBatchType("");
    setSelectedCrusades([]);
    setStep(0);
    setDone(null);
  }

  function discardDraft() {
    clearStoredDraft();
    reset(blueEliteRegistrationDefaults);
    setBatchType("");
    setSelectedCrusades([]);
    setStep(0);
    toast.success("Saved draft cleared.");
  }

  return (
    <div className="reg-page blue-elite-register">
      <header className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="reg-header mx-auto flex h-14 max-w-3xl items-center justify-between rounded-full pl-3 pr-4 backdrop-blur-md">
          <Link to="/blue-elite" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Loveworld Blue Elite" className="h-8 w-auto" />
            <span className="hidden text-sm font-semibold sm:block">Loveworld Blue Elite — Crusade Registration</span>
          </Link>
          <Link to="/blue-elite" className="reg-header-link inline-flex items-center gap-1 text-sm font-semibold transition-colors">
            Back to landing <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </header>

      <main className="reg-main">
       <div className="reg-card">
        {done ? (
          <div className="animate-step-in space-y-6 pb-24 text-center motion-reduce:animate-none">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-8" /></span>
            <h1 className="reg-title text-4xl tracking-[-0.9px]">You’re registered.</h1>
            <p className="mx-auto max-w-md text-muted-foreground">
              <span className="font-semibold text-foreground">{nfull.format(done.planned)} individual crusade{done.planned === 1 ? "" : "s"}</span> from your Blue Elite team have been logged.
              Thank you — now go make them happen.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button type="button" onClick={registerAnother}>Register another set</Button>
              <Button type="button" variant="outline" asChild><Link to="/blue-elite">Back to landing</Link></Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit, () => toast.error("Please fix the highlighted fields."))} onKeyDown={onFormKeyDown} className="space-y-6 pb-24">
            <div className="space-y-2">
              <p className="reg-eyebrow text-sm font-semibold uppercase tracking-[0.35px]">Blue Elite Staff Registration</p>
              <h1 className="reg-title text-3xl tracking-[-0.9px] sm:text-4xl">Register your team’s crusades.</h1>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <p>Your progress is saved automatically in this browser, even while offline.</p>
                <button type="button" onClick={discardDraft} className="font-medium text-foreground underline underline-offset-4">Discard saved draft</button>
              </div>
            </div>

            <p className="blue-elite-mobile-step text-sm font-semibold text-white sm:hidden">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
            <Stepper steps={STEPS} step={step} compact />

            <div key={step} className="animate-step-in space-y-6 motion-reduce:animate-none">
              {step === 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Who is registering?</CardTitle>
                    <CardDescription>Tell us which Blue Elite team these crusades belong to.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Zone" required error={errors.zone?.message}>
                        <Controller control={control} name="zone" render={({ field }) => (
                          <Combobox value={field.value} invalid={!!errors.zone} caps placeholder="Select zone" searchPlaceholder="Search zones…" emptyText="No zones"
                            fetcher={fetchZones} onSelect={(o) => { field.onChange(o.value); setValue("group_name", ""); clearGroupCache(); }} />
                        )} />
                      </Field>
                      <Field label="Group" hint="Optional — leave blank if you serve in the zonal church" error={errors.group_name?.message}>
                        <Controller control={control} name="group_name" render={({ field }) => (
                          <Combobox value={field.value} invalid={!!errors.group_name} caps disabled={!zone}
                            placeholder={zone ? "Select group" : "Pick a zone first"} searchPlaceholder="Search groups…" emptyText="No groups"
                            fetcher={fetchGroups} onSelect={(o) => field.onChange(o.label)} />
                        )} />
                      </Field>
                      <Field label="Church name" hint="Optional — add it only when applicable" error={errors.church_name?.message} className="sm:col-span-2">
                        <Input {...register("church_name")} aria-invalid={!!errors.church_name} placeholder="e.g. Christ Embassy Lekki" />
                      </Field>
                    </div>

                    <div className="border-t pt-4">
                      <p className="mb-3 text-sm font-medium">Staff details</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Staff name" required error={errors.contact_name?.message}>
                          <Input autoComplete="name" {...register("contact_name")} aria-invalid={!!errors.contact_name} placeholder="Your full name" />
                        </Field>
                        <Field label="Department" required error={errors.department?.message}>
                          <Select {...register("department")} aria-invalid={!!errors.department}>
                            <option value="">Select…</option>
                            <option value="Rhapsody of Realities">Rhapsody of Realities</option>
                            <option value="Ministry of Publishing">Ministry of Publishing</option>
                          </Select>
                        </Field>
                        <Field label="Email address" required error={errors.contact_email?.message}>
                          <Input type="email" autoComplete="email" {...register("contact_email")} aria-invalid={!!errors.contact_email} placeholder="you@example.com" />
                        </Field>
                        <Field label="KingsChat username" hint="Optional" error={errors.kingschat_username?.message}>
                          <Input {...register("kingschat_username")} aria-invalid={!!errors.kingschat_username} placeholder="@username" />
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
                      const rowCountry = items?.[i]?.country || "";
                      return (
                        <div key={f.id} id={`crusade-card-${i}`} className="animate-step-in rounded-lg border border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm motion-reduce:animate-none">
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
                            <Field label="Country" required error={rowErr.country?.message} hint="Where this crusade will hold">
                              <Controller control={control} name={`items.${i}.country`} render={({ field }) => (
                                <Combobox value={field.value} invalid={!!rowErr.country} placeholder="Select or search country" searchPlaceholder="Scroll or type a country…"
                                  minChars={0} emptyText="No countries found" fetcher={fetchCountries}
                                  onSelect={(o) => { field.onChange(o.label); setValue(`items.${i}.city`, ""); setValue(`items.${i}.city_place_id`, ""); }} />
                              )} />
                            </Field>
                            <Field label="City" required error={rowErr.city?.message}>
                              <Controller control={control} name={`items.${i}.city`} render={({ field }) => (
                                <Combobox value={field.value} disabled={!rowCountry}
                                  placeholder={rowCountry ? "Search city" : "Pick a country first"} searchPlaceholder="Type a city…" minChars={1} emptyText="No cities found"
                                  allowCreate fetcher={cityFetcherFor(rowCountry)} onSelect={(o) => { const city = citySelectionFields(o); field.onChange(city.city); setValue(`items.${i}.city_place_id`, city.city_place_id); }} />
                              )} />
                            </Field>
                            <Field label="Venue / address" required error={rowErr.venue?.message} className="sm:col-span-2"
                              hint="No address yet? Tap “Unsure” — you can add it after submission.">
                              <div className="relative">
                                <Input placeholder="e.g. City Stadium, 10 Main Road" className="pr-40" {...register(`items.${i}.venue`)} aria-invalid={!!rowErr.venue} />
                                {!(items?.[i]?.venue || "").trim() && (
                                  <button type="button" onClick={() => setValue(`items.${i}.venue`, "Unsure", { shouldValidate: true })}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-input bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent">
                                    Click here if unsure
                                  </button>
                                )}
                              </div>
                            </Field>
                          </div>
                          <Field label="Ministers' names" required error={rowErr.minister_name?.message} className="mt-3" hint="Type a name and press comma to add another minister">
                            <Controller control={control} name={`items.${i}.minister_name`} render={({ field }) => (
                              <MinisterTags value={field.value} onChange={field.onChange} invalid={!!rowErr.minister_name} />
                            )} />
                          </Field>
                        </div>
                      );
                    })}
                    {itemArray.fields.length > 0 && (
                      <Button type="button" variant="outline" className="w-full" onClick={() => addCrusade()}>
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
                    <CardDescription>Check the details, then submit to log your team’s crusades.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <Summary label="Zone" value={watch("zone") || "—"} />
                      <Summary label="Group" value={watch("group_name") || "—"} />
                      <Summary label="Church" value={watch("church_name") || "—"} />
                      <Summary label="Department" value={watch("department") || "—"} />
                      <Summary label="Staff name" value={watch("contact_name") || "—"} />
                      <Summary label="KingsChat" value={watch("kingschat_username") || "—"} />
                      <Summary label="Email" value={watch("contact_email") || "—"} />
                      <Summary label="Phone" value={`${watch("phone_country_code") || ""} ${watch("phone_number") || ""}`.trim() || "—"} />
                      <Summary label="Total crusades" value={nfull.format(totalPlanned)} />
                    </div>
                    <div className="divide-y rounded-lg border">
                      {(items || []).map((it, i) => (
                        <div key={i} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{it.event_name || typeLabel(it.event_type)} · {[it.city, it.country].filter(Boolean).join(", ")} · {it.venue} · {nfull.format(+it.expected_attendance || 0)} expected</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{it.event_date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="blue-elite-action-bar fixed inset-x-0 bottom-0 border-t bg-card/95 backdrop-blur">
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-4">
                  {step > 0 && <Button type="button" variant="ghost" onClick={back}><ArrowLeft /> Back</Button>}
                  <span className="hidden text-sm text-muted-foreground sm:inline">
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
