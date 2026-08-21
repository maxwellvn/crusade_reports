import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ArrowRight, ArrowUpRight, X } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Combobox } from "@/components/Combobox";
import { getJSON, postJSON } from "@/lib/api";
import { blueEliteRegistrationSchema, blueEliteRegistrationDefaults } from "@/lib/schema";
import { CRUSADE_TYPES, PHONE_CODES, BLUE_ELITE_DEPARTMENTS } from "@/lib/constants";
import { typeLabel } from "@/lib/dashboardWidgets";
import { useOrgData, Stepper, Summary } from "@/lib/orgForm";
import { citySelectionFields } from "@/lib/citySelection";
import "../landing.css";

// Loveworld Blue Elite staff registration — a single confirmed crusade with a
// single country. Blue Elite members register one crusade (theirs is a country
// campaign, not a multi-crusade run), then are taken to the Blue Elite campaign
// avatar page where the shared frame is labelled with the selected country. The
// payload shape stays identical to the public registration (items array of one)
// so the server stays untouched; submissions hit /api/blue-elite/registrations
// and are tagged program='blue_elite' server-side.

const STEPS = ["Who you are", "Your crusade", "Review"];
const DRAFT_KEY = "blue-elite-registration-draft-v1";
const clearStoredDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ } };
const STEP_FIELDS = [
  ["zone", "group_name", "church_name", "department", "contact_name", "contact_email", "phone_country_code", "phone_number", "kingschat_username"],
  ["items"],
  [],
];

const BLUE_ELITE_CRUSADE_DATE = "2026-08-28";
const EMPTY_CRUSADE = { event_type: "", event_name: "", event_date: BLUE_ELITE_CRUSADE_DATE, venue: "", expected_attendance: "", minister_name: "", country: "", city: "", city_place_id: "" };
const seedItems = (items) => (Array.isArray(items) && items.length > 0 ? items : [EMPTY_CRUSADE])
  .map((item) => ({ ...item, event_date: BLUE_ELITE_CRUSADE_DATE }));

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
  const navigate = useNavigate();
  const form = useForm({
    resolver: zodResolver(blueEliteRegistrationSchema),
    defaultValues: { ...blueEliteRegistrationDefaults, items: [EMPTY_CRUSADE] },
    mode: "onBlur",
  });
  const { register, handleSubmit, control, watch, getValues, setValue, reset, trigger, formState: { errors, isSubmitting } } = form;
  const draftReady = React.useRef(false);

  const [step, setStep] = React.useState(0);
  const [manualCities, setManualCities] = React.useState(true);
  const zone = watch("zone");
  const item = watch("items")?.[0] || EMPTY_CRUSADE;

  const { fetchCountries, countryCodeOf, fetchZones, fetchGroups, clearGroupCache } = useOrgData(zone);
  // Department picker is a static list (BLUE_ELITE_DEPARTMENTS), but the Combobox
  // expects an async fetcher — wrap a synchronous filter in a resolved promise.
  const fetchDepartments = React.useCallback(
    (query) => {
      const q = query.trim().toLowerCase();
      const matches = !q ? BLUE_ELITE_DEPARTMENTS : BLUE_ELITE_DEPARTMENTS.filter((d) => d.toLowerCase().includes(q));
      return Promise.resolve(matches.map((d) => ({ value: d, label: d })));
    },
    [],
  );
  const country = item.country || "";
  const cityFetcherFor = React.useCallback((countryName) => {
    const code = countryCodeOf(countryName);
    return async (query) => {
      const results = await getJSON(`/places/autocomplete?input=${encodeURIComponent(query)}${code ? `&country=${code}` : ""}`);
      return results.map((place) => ({ value: place.place_id, label: place.main, sublabel: place.secondary }));
    };
  }, [countryCodeOf]);

  React.useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (draft?.values && typeof draft.values === "object") {
        reset({ ...blueEliteRegistrationDefaults, ...draft.values, items: seedItems(draft.values.items) });
        setStep(Math.min(Math.max(Number(draft.step) || 0, 0), STEPS.length - 1));
        toast.success("Your saved Blue Elite draft has been restored.");
      }
    } catch {
      clearStoredDraft();
    }
    draftReady.current = true;
  }, [reset]);

  React.useEffect(() => {
    getJSON("/campaign-settings").then((s) => {
      setManualCities(s.manual_cities_enabled ?? true);
    }).catch(() => { /* default is fine */ });
  }, []);

  React.useEffect(() => {
    if (!draftReady.current) return;
    let timer;
    const save = () => {
      try {
        const values = getValues();
        const hasProgress = Object.values(values).some((value) => Array.isArray(value) ? value.length > 0 : String(value || "").trim());
        if (!hasProgress) return clearStoredDraft();
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, step, savedAt: Date.now() }));
      } catch { /* storage may be unavailable or full */ }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(save, 250); };
    schedule();
    const subscription = watch(schedule);
    return () => { clearTimeout(timer); subscription.unsubscribe(); };
  }, [watch, getValues, step]);

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
    if (e.target.closest("[cmdk-root]")) return;
    e.preventDefault();
    next();
  }

  async function onSubmit(data) {
    if (step !== STEPS.length - 1) return;
    try {
      const payload = {
        ...data,
        items: data.items.map((crusade) => ({ ...crusade, event_date: BLUE_ELITE_CRUSADE_DATE })),
      };
      await postJSON("/blue-elite/registrations", payload);
      clearStoredDraft();
      const crusadeCountry = payload.items[0].country || "";
      const code = countryCodeOf(crusadeCountry);
      navigate(`/blue-elite/avatar?new=1&country=${encodeURIComponent(code)}&name=${encodeURIComponent(crusadeCountry)}`);
    } catch (e) {
      toast.error(e.message);
    }
  }

  const rowErr = errors.items?.[0] || {};

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
        <form onSubmit={handleSubmit(onSubmit, () => toast.error("Please fix the highlighted fields."))} onKeyDown={onFormKeyDown} className="space-y-6 pb-24">
          <div className="space-y-2">
            <p className="reg-eyebrow text-sm font-semibold uppercase tracking-[0.35px]">Blue Elite Staff Registration</p>
            <h1 className="reg-title text-3xl tracking-[-0.9px] sm:text-4xl">Register your crusade.</h1>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>Your progress is saved automatically in this browser, even while offline.</p>
              <button type="button" onClick={() => { clearStoredDraft(); reset({ ...blueEliteRegistrationDefaults, items: [EMPTY_CRUSADE] }); setStep(0); toast.success("Saved draft cleared."); }} className="font-medium text-foreground underline underline-offset-4">Discard saved draft</button>
            </div>
          </div>

          <p className="blue-elite-mobile-step text-sm font-semibold text-white sm:hidden">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
          <Stepper steps={STEPS} step={step} compact />

          <div key={step} className="animate-step-in space-y-6 motion-reduce:animate-none">
            {step === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Who is registering?</CardTitle>
                  <CardDescription>Tell us who is registering this crusade.</CardDescription>
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
                        <Controller control={control} name="department" render={({ field }) => (
                          <Combobox value={field.value} invalid={!!errors.department}
                            placeholder="Select department" searchPlaceholder="Search departments…" emptyText="No matching department"
                            fetcher={fetchDepartments} onSelect={(o) => field.onChange(o.value)} />
                        )} />
                      </Field>
                      <Field label="Email address" required error={errors.contact_email?.message}>
                        <Input type="email" autoComplete="email" {...register("contact_email")} aria-invalid={!!errors.contact_email} placeholder="you@example.com" />
                      </Field>
                      <Field label="KingsChat username" required error={errors.kingschat_username?.message}>
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
                  <CardTitle>Register your crusade</CardTitle>
                  <CardDescription>
                    Register one confirmed crusade for Friday, August 28, 2026. Your campaign avatar will show the selected country.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {typeof errors.items?.message === "string" && <p className="text-xs font-medium">{errors.items.message}</p>}
                  <div className="animate-step-in rounded-lg border border-slate-200 border-l-4 border-l-blue-500 bg-white p-4 shadow-sm motion-reduce:animate-none">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 font-medium">
                        Blue Elite crusade
                      </label>
                      <span className="text-xs font-medium text-muted-foreground">{typeLabel(item.event_type || "")}</span>
                    </div>
                    <input type="hidden" {...register("items.0.event_type")} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Crusade type" required error={rowErr.event_type?.message}>
                        <Select {...register("items.0.event_type")} aria-invalid={!!rowErr.event_type}>
                          <option value="">Select…</option>
                          {CRUSADE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </Select>
                      </Field>
                      <Field label="Crusade name" required error={rowErr.event_name?.message}>
                        <Input placeholder="e.g. Bujumbura Community Crusade" {...register("items.0.event_name")} aria-invalid={!!rowErr.event_name} />
                      </Field>
                      <Field label="Expected attendance" required error={rowErr.expected_attendance?.message}>
                        <Input type="number" min="1" placeholder="e.g. 500" {...register("items.0.expected_attendance")} aria-invalid={!!rowErr.expected_attendance} />
                      </Field>
                      <Field label="Country" required error={rowErr.country?.message} hint="Where this crusade will hold — your avatar will show this country">
                        <Controller control={control} name="items.0.country" render={({ field }) => (
                          <Combobox value={field.value} invalid={!!rowErr.country} placeholder="Select or search country" searchPlaceholder="Scroll or type a country…"
                            minChars={0} emptyText="No countries found" fetcher={fetchCountries}
                            onSelect={(o) => { field.onChange(o.label); setValue("items.0.city", ""); setValue("items.0.city_place_id", ""); }} />
                        )} />
                      </Field>
                      <Field label="City" required error={rowErr.city?.message}>
                        <Controller control={control} name="items.0.city" render={({ field }) => (
                          <Combobox value={field.value} disabled={!country}
                            placeholder={country ? "Search city" : "Pick a country first"} searchPlaceholder="Type a city…" minChars={1} emptyText="No cities found"
                            allowCreate={manualCities} fetcher={cityFetcherFor(country)} onSelect={(o) => { const city = citySelectionFields(o); field.onChange(city.city); setValue("items.0.city_place_id", city.city_place_id); }} />
                        )} />
                      </Field>
                      <Field label="Venue / address" required error={rowErr.venue?.message} className="sm:col-span-2"
                        hint="No address yet? Tap “Unsure” — you can add it after submission.">
                        <div className="relative">
                          <Input placeholder="e.g. City Stadium, 10 Main Road" className="pr-40" {...register("items.0.venue")} aria-invalid={!!rowErr.venue} />
                          {!item.venue && (
                            <button type="button" onClick={() => setValue("items.0.venue", "Unsure", { shouldValidate: true })}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-input bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent">
                              Click here if unsure
                            </button>
                          )}
                        </div>
                      </Field>
                    </div>
                    <Field
                      label="Ministers' names"
                      required
                      error={rowErr.minister_name?.message}
                      className="mt-3"
                      hint={item.event_type === "rabah"
                        ? "If you will minister, enter your own name. If you will use the provided ministry video, enter Pastor Chris. Press comma to add another minister."
                        : "Type a name and press comma to add another minister"}
                    >
                      <Controller control={control} name="items.0.minister_name" render={({ field }) => (
                        <MinisterTags value={field.value} onChange={field.onChange} invalid={!!rowErr.minister_name} />
                      )} />
                    </Field>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Review your registration</CardTitle>
                  <CardDescription>Check the details, then submit to log your crusade.</CardDescription>
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
                    <Summary label="Crusades" value={watch("items")?.length ? "1" : "0"} />
                  </div>
                  <div className="divide-y rounded-lg border">
                    {[item].map((it, i) => (
                      <div key={i} className="px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{it.event_name || typeLabel(it.event_type)} · {[it.city, it.country].filter(Boolean).join(", ")} · {it.venue} · {+it.expected_attendance || 0} expected</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{it.event_date}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="blue-elite-action-bar public-fixed-bottom-action fixed inset-x-0 bottom-0 border-t bg-card/95 backdrop-blur">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-4">
                {step > 0 && <Button type="button" variant="ghost" onClick={back}><ArrowLeft /> Back</Button>}
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {watch("items")?.length > 0
                    ? <><span className="font-semibold text-foreground tabular-nums">1</span> crusade planned</>
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
       </div>
      </main>
    </div>
  );
}
