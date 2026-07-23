import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Loader2, Users, Flame, ChevronDown, AlertTriangle, Check, ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Combobox } from "@/components/Combobox";
import { ImportPanel } from "@/components/ImportPanel";
import { getJSON, postJSON } from "@/lib/api";
import { reportSchema, defaultValues } from "@/lib/schema";
import { CRUSADE_TYPES, FORMATS, ONLINE_TYPES, CORE_OUTCOMES, EXTENDED_OUTCOMES, PHONE_CODES, emptyCrusade } from "@/lib/constants";
import { useOrgData, Stepper, Summary } from "@/lib/orgForm";
import { nfull } from "@/lib/dashboardWidgets";
import "../landing.css"; // campaign fonts; report theme lives in the .reg-page block

// Post-crusade report form — the twin of the registration form. Same campaign-
// style stepper, same draft persistence, same per-crusade country pattern. The
// difference: this captures RESULTS (attendance, salvations, outcomes) for
// crusades that have already held, whether or not they were pre-registered.

const STEPS = ["Who is reporting", "Your crusades", "Review"];
const DRAFT_KEY = "crusade-report-draft-v1";
const clearStoredDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ } };
const STEP_FIELDS = [
  ["organization_type", "zone", "group_name", "church_name", "cell_name", "network_name",
    "contact_name", "contact_email", "phone_country_code", "phone_number"],
  ["crusades"],
  [],
];

const typeLabel = (v) => CRUSADE_TYPES.find(([c]) => c === v)?.[1] || v;

// A crusade row is "untouched" when none of its detail fields have been filled.
// Stops a distracted user from stacking blank rows by clicking "Add" repeatedly.
const CRUSADE_DETAIL_FIELDS = ["event_name", "event_date", "venue", "attendance", "country", "city", "minister_name"];
const isCrusadeUntouched = (item) => !!item && CRUSADE_DETAIL_FIELDS.every((key) => !String(item[key] ?? "").trim());

export function ReportForm() {
  const form = useForm({ resolver: zodResolver(reportSchema), defaultValues, mode: "onBlur" });
  const { register, handleSubmit, control, watch, setValue, getValues, reset, trigger, formState: { errors, isSubmitting } } = form;
  const draftReady = React.useRef(false);

  const [searchParams] = useSearchParams();
  const portalToken = searchParams.get("portal") || "";
  const [step, setStep] = React.useState(0);
  const [done, setDone] = React.useState(null);
  const [batchType, setBatchType] = React.useState("");
  const [reportingOpen, setReportingOpen] = React.useState(null);
  const [portalScope, setPortalScope] = React.useState(null);
  const [portalError, setPortalError] = React.useState("");
  const orgType = watch("organization_type");
  const zone = watch("zone");
  const crusades = watch("crusades");

  const needsZone = ["zone", "group", "church", "cell"].includes(orgType);
  const needsGroup = ["group", "church", "cell"].includes(orgType);
  const needsChurch = ["church", "cell"].includes(orgType);
  const needsCell = orgType === "cell";

  const { fetchCountries, countryCodeOf, fetchZones, fetchGroups, fetchNetworks, setNetworks, clearGroupCache } = useOrgData(zone);
  // Each crusade carries its own country, so its city search is scoped to that country.
  const cityFetcherFor = React.useCallback((countryName) => {
    const code = countryCodeOf(countryName);
    return async (query) => {
      const results = await getJSON(`/places/autocomplete?input=${encodeURIComponent(query)}${code ? `&country=${code}` : ""}`);
      return results.map((place) => ({ value: place.place_id, label: place.main, sublabel: place.secondary }));
    };
  }, [countryCodeOf]);
  const crusadeArray = useFieldArray({ control, name: "crusades" });

  // ---- Draft persistence (mirrors RegistrationForm) ---------------------------
  React.useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (draft?.values && typeof draft.values === "object") {
        reset({ ...defaultValues, ...draft.values, crusades: Array.isArray(draft.values.crusades) ? draft.values.crusades : [] });
        setStep(Math.min(Math.max(Number(draft.step) || 0, 0), STEPS.length - 1));
        setBatchType(draft.batchType || "");
        toast.success("Your saved report draft has been restored.");
      }
    } catch {
      clearStoredDraft();
    }
    draftReady.current = true;
  }, [reset]);

  React.useEffect(() => {
    getJSON("/campaign-settings")
      .then((settings) => setReportingOpen(settings.reporting_open))
      .catch(() => setReportingOpen(false));
  }, []);

  React.useEffect(() => {
    if (!portalToken) return;
    getJSON(`/zone-portal/${encodeURIComponent(portalToken)}`)
      .then((scope) => {
        setPortalScope(scope);
        setValue("organization_type", scope.kind === "network" ? "network" : "zone", { shouldValidate: true });
        setValue("zone", scope.kind === "zone" ? scope.zone : "", { shouldValidate: true });
        setValue("network_name", scope.kind === "network" ? scope.zone : "", { shouldValidate: true });
        setValue("network_type", scope.kind === "network" ? "predefined" : "");
      })
      .catch((error) => setPortalError(error.message));
  }, [portalToken, setValue]);

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

  const totals = (crusades || []).reduce(
    (a, c) => ({ n: a.n + 1, onsite: a.onsite + (+c.attendance || 0), online: a.online + (+c.online_participation || 0) }),
    { n: 0, onsite: 0, online: 0 }
  );
  totals.att = totals.onsite + totals.online;

  // ---- Handlers ---------------------------------------------------------------
  function applyScope(scope) {
    if (!scope) return;
    setValue("organization_type", scope.kind === "network" ? "network" : "zone", { shouldValidate: true });
    setValue("zone", scope.kind === "zone" ? scope.zone : "", { shouldValidate: true });
    setValue("network_name", scope.kind === "network" ? scope.zone : "", { shouldValidate: true });
  }

  async function onSelectNetwork(opt) {
    if (opt.created) {
      try {
        const saved = await postJSON("/networks", { name: opt.value });
        setNetworks((n) => (n.some((x) => x.name === saved.name) ? n : [...n, saved]));
        setValue("network_name", saved.name, { shouldValidate: true });
        setValue("network_type", "other");
        toast.success(`Added network "${saved.name}"`);
      } catch (e) {
        toast.error(e.message);
      }
    } else {
      setValue("network_name", opt.value, { shouldValidate: true });
      setValue("network_type", "predefined");
    }
  }

  function addCrusade(type = batchType) {
    if (!type) {
      toast.error("Select the crusade type first.");
      document.querySelector("[data-crusade-generator]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (crusadeArray.fields.length >= 500) return toast.error("Maximum of 500 crusades per report.");
    const current = getValues("crusades") || [];
    const lastIndex = current.length - 1;
    if (lastIndex >= 0 && isCrusadeUntouched(current[lastIndex])) {
      toast.error("Fill in the crusade you just added before adding another.");
      document.getElementById(`crusade-card-${lastIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    crusadeArray.append({ ...emptyCrusade(), event_type: type });
    toast.success(`${typeLabel(type)} detail form added.`);
    // Reset the type selector so the user consciously picks the type for the
    // next crusade instead of silently stacking the same type.
    setBatchType("");
  }

  function removeCrusade(i) {
    crusadeArray.remove(i);
    toast.success("Crusade removed.");
  }

  const cloneCrusade = (i) => crusadeArray.append({ ...getValues(`crusades.${i}`), country: "", city: "", city_place_id: "" });

  async function next() {
    const ok = await trigger(STEP_FIELDS[step]);
    if (!ok) return toast.error("Please fix the highlighted fields.");
    if (step === 1 && !(getValues("crusades") || []).length) return toast.error("Add at least one crusade.");
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

  async function onSubmit(data) {
    if (step !== STEPS.length - 1) return;
    try {
      const { id } = await postJSON("/reports", { ...data, portal_token: portalToken || undefined });
      clearStoredDraft();
      setDone({ id, n: totals.n, att: totals.att });
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error(e.message);
    }
  }

  function reportAnother() {
    clearStoredDraft();
    reset(defaultValues);
    setBatchType("");
    setStep(0);
    setDone(null);
    applyScope(portalScope);
  }

  function discardDraft() {
    clearStoredDraft();
    reset(defaultValues);
    setBatchType("");
    setStep(0);
    applyScope(portalScope);
    toast.success("Saved draft cleared.");
  }

  if (reportingOpen === null) return <div className="reg-page"><div className="reg-main"><div className="reg-card"><div className="py-16 text-center text-sm text-muted-foreground">Checking reporting access…</div></div></div></div>;
  if (!reportingOpen) return (
    <div className="reg-page"><div className="reg-main"><div className="reg-card">
      <h1 className="reg-title text-3xl">Reporting is closed.</h1>
      <p className="mt-2 text-sm text-muted-foreground">Reporting has not opened yet. Please return when your coordinator announces that reporting is open.</p>
    </div></div></div>
  );
  if (portalError) return (
    <div className="reg-page"><div className="reg-main"><div className="reg-card">
      <h1 className="reg-title text-3xl">This dashboard link is not valid.</h1>
      <p className="mt-2 text-sm text-muted-foreground">{portalError}</p>
    </div></div></div>
  );

  return (
    <div className="reg-page">
      {/* Pill header, campaign style — same as the registration form */}
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
            <h1 className="reg-title text-4xl tracking-[-0.9px]">Report submitted.</h1>
            <p className="mx-auto max-w-md text-muted-foreground">
              <span className="font-semibold text-foreground">{nfull.format(done.n)} crusade{done.n === 1 ? "" : "s"}</span> with
              <span className="font-semibold text-foreground"> {nfull.format(done.att)}</span> total attendance reported.
              Thank you — your results are now in the dashboards.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button type="button" onClick={reportAnother}>Report another organization</Button>
              <Button type="button" variant="outline" asChild><Link to="/crusade-registration">Back to campaign page</Link></Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit, () => toast.error("Please fix the highlighted fields."))} onKeyDown={onFormKeyDown} className="space-y-6 pb-28">
            <div className="space-y-2">
              <p className="reg-eyebrow text-sm font-semibold uppercase tracking-[0.35px]">Crusade Report</p>
              <h1 className="reg-title text-3xl tracking-[-0.9px] sm:text-4xl">Report your crusades.</h1>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <p>Your progress is saved automatically in this browser, even while offline.</p>
                <button type="button" onClick={discardDraft} className="font-medium text-foreground underline underline-offset-4">Discard saved draft</button>
              </div>
            </div>

            {portalScope && <Card><CardContent className="pt-6">
              <p className="text-sm font-medium">Reporting an unregistered crusade for {portalScope.zone}</p>
              <p className="text-xs text-muted-foreground">This report will be assigned to this {portalScope.kind}. Add one complete detail block for every crusade held.</p>
            </CardContent></Card>}

            <Stepper steps={STEPS} step={step} />

            <div key={step} className="animate-step-in space-y-6 motion-reduce:animate-none">
              {step === 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Who is reporting?</CardTitle>
                    <CardDescription>Tell us where this report is coming from.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Field label="Reporting as" required error={errors.organization_type?.message}
                      hint="Who is this report for? A Zone, Group, Church, Cell, or Network.">
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
                          <Field label="Church name" required error={errors.church_name?.message} hint="Type the church name" className={needsCell ? "" : "sm:col-span-2"}>
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
                      <Field label="Network" required error={errors.network_name?.message} hint="Search, or type a new one to add it">
                        {portalScope ? <Input value={portalScope.zone} readOnly /> : <Controller control={control} name="network_name" render={({ field }) => (
                          <Combobox value={field.value} invalid={!!errors.network_name} caps placeholder="Select or add network" searchPlaceholder="Search networks…"
                            emptyText="No match — type to add" allowCreate fetcher={fetchNetworks} onSelect={onSelectNetwork} />
                        )} />}
                      </Field>
                    )}

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
                <>
                  <ImportPanel
                    getReportFields={() => {
                      const v = getValues();
                      return {
                        organization_type: v.organization_type, zone: v.zone, group_name: v.group_name,
                        church_name: v.church_name, cell_name: v.cell_name, network_name: v.network_name,
                        contact_name: v.contact_name, contact_email: v.contact_email, phone_country_code: v.phone_country_code,
                        phone_number: v.phone_number, kingschat_username: v.kingschat_username,
                      };
                    }}
                    onLoaded={(rows) => crusadeArray.replace(rows.map((r) => ({ ...emptyCrusade(), ...r })))}
                  />
                  <Card>
                    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                      <div>
                        <CardTitle>Report each crusade</CardTitle>
                        <CardDescription>
                          Select the type and add crusades one by one; each adds one detail form. Enter one block per crusade held — each has its own country, city, date and results.
                        </CardDescription>
                      </div>
                      <div className="flex gap-2 text-xs">
                        <Badge variant="outline" className="gap-1"><Flame className="size-3" /> {totals.n}</Badge>
                        <Badge variant="outline" className="gap-1"><Users className="size-3" /> {totals.att.toLocaleString()}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {typeof errors.crusades?.message === "string" && <p className="text-xs font-medium text-destructive">{errors.crusades.message}</p>}
                      <div data-crusade-generator className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                        <Field label="Crusade type" required>
                          <Select value={batchType} onChange={(e) => setBatchType(e.target.value)}>
                            <option value="">Select…</option>
                            {CRUSADE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </Select>
                        </Field>
                        <Button type="button" onClick={() => addCrusade()}>
                          <Plus /> {crusadeArray.fields.length > 0 ? "Add another crusade" : "Add crusade"}
                        </Button>
                      </div>

                      {crusadeArray.fields.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3 text-sm">
                          <p><span className="font-semibold">{nfull.format(crusadeArray.fields.length)}</span> crusade detail form{crusadeArray.fields.length === 1 ? "" : "s"} to complete.</p>
                          <Button type="button" variant="ghost" size="sm" onClick={() => { crusadeArray.replace([]); setBatchType(""); }}>Start over</Button>
                        </div>
                      )}

                      {crusadeArray.fields.map((f, i) => (
                        <CrusadeRow key={f.id} id={`crusade-card-${i}`} index={i} form={form} errors={errors} fetchCountries={fetchCountries} cityFetcherFor={cityFetcherFor}
                          onRemove={() => removeCrusade(i)} onClone={() => cloneCrusade(i)} />
                      ))}
                      {crusadeArray.fields.length > 0 && (
                        <Button type="button" variant="outline" className="w-full" onClick={() => addCrusade()}>
                          <Plus /> Add another crusade
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}

              {step === 2 && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Review your report</CardTitle>
                      <CardDescription>Check the summary, then submit.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <div className="grid grid-cols-2 gap-3">
                        <Summary label="Reporting as" value={orgType || "—"} />
                        {zone && <Summary label="Zone" value={zone} />}
                        {watch("group_name") && <Summary label="Group" value={watch("group_name")} />}
                        {watch("church_name") && <Summary label="Church" value={watch("church_name")} />}
                        {watch("cell_name") && <Summary label="Cell" value={watch("cell_name")} />}
                        {watch("network_name") && <Summary label="Network" value={watch("network_name")} />}
                        <Summary label="Contact name" value={watch("contact_name") || "—"} />
                        <Summary label="Email" value={watch("contact_email") || "—"} />
                        <Summary label="Phone" value={`${watch("phone_country_code") || ""} ${watch("phone_number") || ""}`.trim() || "—"} />
                        <Summary label="KingsChat" value={watch("kingschat_username") || "—"} />
                        <Summary label="Crusades" value={nfull.format(totals.n)} />
                        <Summary label="Total attendance" value={nfull.format(totals.att)} />
                        <Summary label="Onsite attendance" value={nfull.format(totals.onsite)} />
                        <Summary label="Online attendance" value={nfull.format(totals.online)} />
                      </div>
                      <div className="rounded-lg border divide-y">
                        {(crusades || []).map((c, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                            <span className="truncate">{typeLabel(c.event_type)}{c.format === "online" ? " (online)" : ""} · {c.city}, {c.country} · {c.venue}</span>
                            <span className="shrink-0 text-muted-foreground">{c.event_date} · {((+c.attendance || 0) + (+c.online_participation || 0)).toLocaleString()} · {(+c.salvation || 0).toLocaleString()} saved</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Highlights & media</CardTitle>
                      <CardDescription>Optional context for the whole report.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Field label="Highlights" error={errors.highlights?.message}>
                        <Textarea {...register("highlights")} rows={4} placeholder="Notable testimonies, moments…" />
                      </Field>
                      <Field label="Media links" error={errors.media_links?.message} hint="One link per line (Google Drive, OneDrive, YouTube…)">
                        <Textarea {...register("media_links")} rows={3} placeholder="https://drive.google.com/…" />
                      </Field>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Sticky bar: live total + navigation */}
            <div className="fixed inset-x-0 bottom-0 border-t bg-card/90 backdrop-blur">
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-4">
                  {step > 0 && <Button type="button" variant="ghost" onClick={back}><ArrowLeft /> Back</Button>}
                  <span className="text-sm text-muted-foreground">
                    {totals.n > 0
                      ? <><span className="font-semibold text-foreground tabular-nums">{nfull.format(totals.n)}</span> crusade{totals.n === 1 ? "" : "s"} · {nfull.format(totals.att)} attendance</>
                      : `Step ${step + 1} of ${STEPS.length}`}
                  </span>
                </div>
                {step < STEPS.length - 1 ? (
                  <Button key="next" type="button" size="lg" onClick={next}>Next <ArrowRight /></Button>
                ) : (
                  <Button key="submit" type="submit" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? <><Loader2 className="animate-spin" /> Submitting…</> : "Submit report"}
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

// One crusade = one event. Country + city per crusade, essentials + core outcomes
// always visible; extended stats + metadata behind a labelled expander.
function CrusadeRow({ id, index, form, errors, fetchCountries, cityFetcherFor, onRemove, onClone }) {
  const { register, control, setValue, watch } = form;
  const [open, setOpen] = React.useState(false);
  const c = watch(`crusades.${index}`) || {};
  const rowErr = errors.crusades?.[index] || {};
  const p = (name) => `crusades.${index}.${name}`;

  const isOnline = c.format === "online";
  const att = (+c.attendance || 0) + (+c.online_participation || 0);
  const sal = +c.salvation || 0;
  const warns = [];
  if (sal > att) warns.push("Salvations exceed attendance — double-check.");
  if (c.event_type === "mega" && att > 0 && att < 4000) warns.push("Mega crusades usually have 4,000+ attendance.");
  if (!isOnline && ONLINE_TYPES.includes(c.event_type)) warns.push("This crusade type is usually held online — check the format.");

  const rowCountry = c.country || "";

  function onTypeChange(e) {
    if (!c.format && ONLINE_TYPES.includes(e.target.value)) setValue(p("format"), "online", { shouldValidate: true });
  }
  function onFormatChange(e) {
    if (e.target.value === "online") setValue(p("attendance"), 0);
  }

  return (
    <div id={id} className="animate-step-in rounded-lg border border-slate-200 border-l-4 border-l-violet-500 bg-white p-4 shadow-sm motion-reduce:animate-none">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-medium">Crusade {index + 1}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{typeLabel(c.event_type)}</span>
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove crusade ${index + 1}`}>
            <Trash2 />
          </Button>
        </div>
      </div>
      <input type="hidden" {...register(p("event_type"))} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Format" required error={rowErr.format?.message} hint="Physical (people gathered on-ground) or fully online">
          <Select {...register(p("format"), { onChange: onFormatChange })} aria-invalid={!!rowErr.format}>
            <option value="">Select…</option>
            {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        {c.event_type === "other" && (
          <Field label="Specify type" required error={rowErr.other_event_type?.message} hint="Describe the crusade type">
            <Input {...register(p("other_event_type"))} aria-invalid={!!rowErr.other_event_type} />
          </Field>
        )}
        <Field label="Event name" required error={rowErr.event_name?.message} hint="A short label, e.g. 'Aba Street Reach'">
          <Input {...register(p("event_name"))} aria-invalid={!!rowErr.event_name} placeholder="Name this crusade" />
        </Field>
        <Field label="Date" required error={rowErr.event_date?.message} hint="The day the crusade held">
          <Input type="date" {...register(p("event_date"))} aria-invalid={!!rowErr.event_date} />
        </Field>
        <Field label="Country" required error={rowErr.country?.message} hint="Where this crusade held">
          <Controller control={control} name={p("country")} render={({ field }) => (
            <Combobox value={field.value} invalid={!!rowErr.country} placeholder="Select or search country" searchPlaceholder="Scroll or type a country…"
              minChars={0} emptyText="No countries found" fetcher={fetchCountries}
              onSelect={(o) => { field.onChange(o.label); setValue(p("city"), ""); setValue(p("city_place_id"), ""); }} />
          )} />
        </Field>
        <Field label="City" required error={rowErr.city?.message} hint="Where it held — start typing to search">
          <Controller control={control} name={p("city")} render={({ field }) => (
            <Combobox value={field.value} invalid={!!rowErr.city} disabled={!rowCountry}
              placeholder={rowCountry ? "Search city" : "Pick a country first"} searchPlaceholder="Type a city…" minChars={1} emptyText="No cities found"
              fetcher={cityFetcherFor(rowCountry)} onSelect={(o) => { field.onChange(o.label); setValue(p("city_place_id"), o.value); }} />
          )} />
        </Field>
        {!isOnline && (
          <Field label="Onsite attendance" required error={rowErr.attendance?.message} hint="People physically present">
            <Input type="number" min="0" {...register(p("attendance"))} aria-invalid={!!rowErr.attendance} />
          </Field>
        )}
        <Field label="Online attendance" required={isOnline} error={rowErr.online_participation?.message}
          hint={isOnline ? "People who joined online" : "Watched via stream — leave 0 if none"}>
          <Input type="number" min="0" {...register(p("online_participation"))} aria-invalid={!!rowErr.online_participation} />
        </Field>
        <Field label="Minister" required error={rowErr.minister_name?.message} hint="Who ministered at this crusade">
          <Input {...register(p("minister_name"))} aria-invalid={!!rowErr.minister_name} placeholder="e.g. Pastor John" />
        </Field>
        <Field label="Venue" required error={rowErr.venue?.message} hint="Where it held. For online/TV/radio, put 'Online' or 'N/A'">
          <Input {...register(p("venue"))} aria-invalid={!!rowErr.venue} placeholder="e.g. City Stadium" />
        </Field>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Outcomes <span className="font-normal">(optional — leave blank if none)</span></p>
        <div className="grid gap-3 sm:grid-cols-3">
          {CORE_OUTCOMES.map(([key, label]) => (
            <Field key={key} label={label} error={rowErr[key]?.message}>
              <Input type="number" min="0" {...register(p(key))} aria-invalid={!!rowErr[key]} />
            </Field>
          ))}
        </div>
      </div>

      {warns.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {warns.map((w) => (
            <p key={w} className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="size-3.5 shrink-0" /> {w}</p>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setOpen((o) => !o)}
        className="mt-3 flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent">
        <span>More outcomes — online reach & materials distributed <span className="text-muted-foreground">(optional)</span></span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 grid animate-step-in gap-3 sm:grid-cols-3 motion-reduce:animate-none">
          {EXTENDED_OUTCOMES.map(([key, label]) => (
            <Field key={key} label={label} error={rowErr[key]?.message}>
              <Input type="number" min="0" {...register(p(key))} aria-invalid={!!rowErr[key]} />
            </Field>
          ))}
        </div>
      )}

      <Button type="button" variant="ghost" size="sm" onClick={onClone} className="mt-3 text-muted-foreground">
        <Copy className="size-4" /> Duplicate this crusade<span className="max-sm:hidden"> (copy its details into a new one)</span>
      </Button>
    </div>
  );
}
