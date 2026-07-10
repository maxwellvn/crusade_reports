import * as React from "react";
import { Link } from "react-router-dom";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Loader2, Check, ArrowLeft, ArrowRight, ArrowUpRight, X } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Combobox } from "@/components/Combobox";
import { postJSON } from "@/lib/api";
import { registrationSchema, registrationDefaults } from "@/lib/schema";
import { CRUSADE_TYPES } from "@/lib/constants";
import { nfull, typeLabel } from "@/lib/dashboardWidgets";
import { useOrgData, Stepper, Summary } from "@/lib/orgForm";
import "../landing.css"; // campaign fonts; reg theme lives in the .reg-page block

// Public crusade registration — the intent-side twin of the report form.
// Zones/groups/churches/networks declare how many crusades of each type they
// will hold, where, for one plan date. Total = sum of the breakdown, never typed.

const STEPS = ["Who you are", "Your crusades", "Review"];
const STEP_FIELDS = [
  ["organization_type", "zone", "group_name", "church_name", "cell_name", "network_name", "country", "plan_date"],
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
  const { register, handleSubmit, control, watch, setValue, getValues, reset, trigger, formState: { errors, isSubmitting } } = form;

  const [step, setStep] = React.useState(0);
  const [done, setDone] = React.useState(null); // {planned, date} after successful submit
  const orgType = watch("organization_type");
  const zone = watch("zone");
  const country = watch("country");
  const items = watch("items");

  const needsZone = ["zone", "group", "church", "cell"].includes(orgType);
  const needsGroup = ["group", "church", "cell"].includes(orgType);
  const needsChurch = ["church", "cell"].includes(orgType);
  const needsCell = orgType === "cell";

  const [countryCode, setCountryCode] = React.useState("");
  const { fetchCountries, fetchCities, fetchZones, fetchGroups, fetchNetworks, clearGroupCache } = useOrgData(zone, countryCode);
  const itemArray = useFieldArray({ control, name: "items" });

  const totalPlanned = (items || []).reduce((a, i) => a + (+i.planned_count || 0), 0);

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
    e.preventDefault();
    if (e.target.closest("[cmdk-root]")) return;
    next();
  }

  async function onSubmit(data) {
    if (step !== STEPS.length - 1) return;
    try {
      await postJSON("/registrations", data);
      setDone({ planned: totalPlanned, date: data.plan_date });
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error(e.message);
    }
  }

  function registerAnother() {
    reset(registrationDefaults);
    setCountryCode("");
    setStep(0);
    setDone(null);
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
        {done ? (
          <div className="animate-step-in space-y-6 pb-24 text-center motion-reduce:animate-none">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-8" /></span>
            <h1 className="reg-title text-4xl tracking-[-0.9px]">You’re registered.</h1>
            <p className="mx-auto max-w-md text-muted-foreground">
              <span className="font-semibold text-foreground">{nfull.format(done.planned)} crusades</span> planned
              for <span className="font-semibold text-foreground">{done.date}</span> have joined the global tally.
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
            </div>

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
                      <Select {...register("organization_type")} aria-invalid={!!errors.organization_type}
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
                          <Controller control={control} name="zone" render={({ field }) => (
                            <Combobox value={field.value} invalid={!!errors.zone} caps placeholder="Select zone" searchPlaceholder="Search zones…" emptyText="No zones"
                              fetcher={fetchZones} onSelect={(o) => { field.onChange(o.value); setValue("group_name", ""); clearGroupCache(); }} />
                          )} />
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
                        <Controller control={control} name="network_name" render={({ field }) => (
                          <Combobox value={field.value} invalid={!!errors.network_name} caps placeholder="Select network" searchPlaceholder="Search networks…"
                            emptyText="No networks found" fetcher={fetchNetworks} onSelect={(o) => field.onChange(o.value)} />
                        )} />
                      </Field>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Country" required error={errors.country?.message} hint="Where these crusades will hold">
                        <Controller control={control} name="country" render={({ field }) => (
                          <Combobox value={field.value} invalid={!!errors.country} placeholder="Select or search country" searchPlaceholder="Scroll or type a country…"
                            minChars={0} emptyText="No countries found" fetcher={fetchCountries}
                            onSelect={(o) => { setValue("country", o.label, { shouldValidate: true }); setCountryCode(o.value); }} />
                        )} />
                      </Field>
                      <Field label="Plan date" required error={errors.plan_date?.message} hint="The date the crusades are planned for">
                        <Input type="date" {...register("plan_date")} aria-invalid={!!errors.plan_date} />
                      </Field>
                    </div>
                  </CardContent>
                </Card>
              )}

              {step === 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Break it down by crusade type</CardTitle>
                    <CardDescription>
                      Planning 1,000 crusades? Tell us how many of each kind — and the city, if you already know it.
                      Same type in several cities? Add the type once per city.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {typeof errors.items?.message === "string" && <p className="text-xs font-medium">{errors.items.message}</p>}
                    {itemArray.fields.map((f, i) => {
                      const rowErr = errors.items?.[i] || {};
                      return (
                        <div key={f.id} className="relative animate-step-in rounded-lg border bg-muted/30 p-4 motion-reduce:animate-none">
                          {itemArray.fields.length > 1 && (
                            <button type="button" onClick={() => itemArray.remove(i)} title="Remove"
                              className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                              <Trash2 className="size-4" />
                            </button>
                          )}
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="Crusade type" required error={rowErr.event_type?.message}>
                              <Select {...register(`items.${i}.event_type`)} aria-invalid={!!rowErr.event_type}>
                                <option value="">Select…</option>
                                {CRUSADE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </Select>
                            </Field>
                            <Field label="How many" required error={rowErr.planned_count?.message}>
                              <Input type="number" min="1" placeholder="e.g. 250" {...register(`items.${i}.planned_count`)} aria-invalid={!!rowErr.planned_count} />
                            </Field>
                            <Field label="City" error={rowErr.city?.message} hint="Optional — leave blank if nationwide">
                              <Controller control={control} name={`items.${i}.city`} render={({ field }) => (
                                <Combobox value={field.value} disabled={!country}
                                  placeholder={country ? "Search city (optional)" : "Pick a country first"} searchPlaceholder="Type a city…" minChars={1} emptyText="No cities found"
                                  fetcher={fetchCities} onSelect={(o) => { field.onChange(o.label); setValue(`items.${i}.city_place_id`, o.value); }} />
                              )} />
                            </Field>
                          </div>
                          {items?.[i]?.event_type === "mega" && (
                            <Field label="Ministers' names" required error={rowErr.minister_name?.message} className="mt-3" hint="Type a name and press comma to add another minister">
                              <Controller control={control} name={`items.${i}.minister_name`} render={({ field }) => (
                                <MinisterTags value={field.value} onChange={field.onChange} invalid={!!rowErr.minister_name} />
                              )} />
                            </Field>
                          )}
                          <Button type="button" variant="ghost" size="sm" className="mt-2 text-muted-foreground"
                            onClick={() => itemArray.append({ ...getValues(`items.${i}`) })}>
                            <Copy className="size-4" /> Duplicate this row<span className="max-sm:hidden"> (same type & count, e.g. for another city)</span>
                          </Button>
                        </div>
                      );
                    })}
                    <Button type="button" variant="outline" className="w-full"
                      onClick={() => itemArray.append({ event_type: "", planned_count: "", minister_name: "", city: "", city_place_id: "" })}>
                      <Plus /> Add another crusade type
                    </Button>
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
                      <Summary label="Plan date" value={watch("plan_date") || "—"} />
                      <Summary label="Total crusades" value={nfull.format(totalPlanned)} />
                    </div>
                    <div className="divide-y rounded-lg border">
                      {(items || []).map((it, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="truncate">{typeLabel(it.event_type)}{it.minister_name ? ` · ${it.minister_name}` : ""}{it.city ? ` · ${it.city}` : ""}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{nfull.format(+it.planned_count || 0)}</span>
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
