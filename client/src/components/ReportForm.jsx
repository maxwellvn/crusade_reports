import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Loader2, Users, Flame, ChevronDown, AlertTriangle, Check, ArrowLeft, ArrowRight } from "lucide-react";

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

const STEPS = ["Reporting", "Crusades", "Review"];
const STEP_FIELDS = [
  ["organization_type", "zone", "group_name", "church_name", "cell_name", "network_name", "country",
    "contact_name", "contact_email", "phone_country_code", "phone_number"],
  ["crusades"],
  [],
];

const typeLabel = (v) => CRUSADE_TYPES.find(([c]) => c === v)?.[1] || v;

export function ReportForm() {
  const form = useForm({ resolver: zodResolver(reportSchema), defaultValues, mode: "onBlur" });
  const { register, handleSubmit, control, watch, setValue, getValues, reset, trigger, formState: { errors, isSubmitting } } = form;

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const portalToken = searchParams.get("portal") || "";
  const [step, setStep] = React.useState(0);
  const [reportingOpen, setReportingOpen] = React.useState(null);
  const [portalScope, setPortalScope] = React.useState(null);
  const [portalError, setPortalError] = React.useState("");
  const orgType = watch("organization_type");
  const zone = watch("zone");
  const country = watch("country");
  const crusades = watch("crusades");

  const needsZone = ["zone", "group", "church", "cell"].includes(orgType);
  const needsGroup = ["group", "church", "cell"].includes(orgType);
  const needsChurch = ["church", "cell"].includes(orgType);
  const needsCell = orgType === "cell";

  const [countryCode, setCountryCode] = React.useState("");
  const { fetchCountries, fetchCities, fetchZones, fetchGroups, fetchNetworks, setNetworks, clearGroupCache } = useOrgData(zone, countryCode);
  const crusadeArray = useFieldArray({ control, name: "crusades" });

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

  const totals = (crusades || []).reduce(
    (a, c) => ({ n: a.n + 1, onsite: a.onsite + (+c.attendance || 0), online: a.online + (+c.online_participation || 0) }),
    { n: 0, onsite: 0, online: 0 }
  );
  totals.att = totals.onsite + totals.online;

  // ---- Handlers -----------------------------------------------------------
  function onSelectCountry(opt) {
    setValue("country", opt.label, { shouldValidate: true });
    setCountryCode(opt.value);
  }
  async function onSelectNetwork(opt) {
    if (opt.created) {
      try {
        const saved = await postJSON("/networks", { name: opt.value });
        setNetworks((n) => (n.some((x) => x.name === saved.name) ? n : [...n, saved]));
        setValue("network_name", saved.name, { shouldValidate: true });
        setValue("network_type", "other");
        toast.success(`Added network “${saved.name}”`);
      } catch (e) {
        toast.error(e.message);
      }
    } else {
      setValue("network_name", opt.value, { shouldValidate: true });
      setValue("network_type", "predefined");
    }
  }
  const cloneCrusade = (i) => crusadeArray.append({ ...getValues(`crusades.${i}`) });

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

  // Enter anywhere before Review = "Next", not submit — otherwise handleSubmit
  // validates the whole form and paints errors on steps the user hasn't seen.
  function onFormKeyDown(e) {
    if (e.key !== "Enter" || step === STEPS.length - 1) return;
    if (e.target.tagName === "TEXTAREA") return;
    e.preventDefault(); // never implicit-submit before Review
    if (e.target.closest("[cmdk-root]")) return; // Enter in a combobox selects, not advances
    next();
  }

  async function onSubmit(data) {
    if (step !== STEPS.length - 1) return; // belt-and-braces: only Review may submit
    try {
      const { id } = await postJSON("/reports", { ...data, portal_token: portalToken || undefined });
      toast.success(`Report #${id} submitted. Thank you!`);
      reset(defaultValues);
      setCountryCode("");
      setStep(0);
      if (portalToken) navigate(`/zone/${portalToken}`);
    } catch (e) {
      toast.error(e.message);
    }
  }

  if (reportingOpen === null) return <div className="mx-auto max-w-3xl"><Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Checking reporting access…</CardContent></Card></div>;
  if (!reportingOpen) return <div className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Reporting is closed</CardTitle><CardDescription>Reporting has not opened yet. Please return when your coordinator announces that reporting is open.</CardDescription></CardHeader></Card></div>;
  if (portalError) return <div className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>This dashboard link is not valid</CardTitle><CardDescription>{portalError}</CardDescription></CardHeader></Card></div>;

  return (
    <form onSubmit={handleSubmit(onSubmit, () => toast.error("Please fix the highlighted fields."))} onKeyDown={onFormKeyDown} className="mx-auto max-w-3xl space-y-6 pb-28">
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

            <Field label="Country" required error={errors.country?.message} hint="All crusades in this report are in this country">
              <Controller control={control} name="country" render={({ field }) => (
                <Combobox value={field.value} invalid={!!errors.country} placeholder="Select or search country" searchPlaceholder="Scroll or type a country…"
                  minChars={0} emptyText="No countries found" fetcher={fetchCountries} onSelect={onSelectCountry} />
              )} />
            </Field>

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
                church_name: v.church_name, cell_name: v.cell_name, network_name: v.network_name, country: v.country,
                contact_name: v.contact_name, contact_email: v.contact_email, phone_country_code: v.phone_country_code,
                phone_number: v.phone_number, kingschat_username: v.kingschat_username,
              };
            }}
            onLoaded={(rows) => crusadeArray.replace(rows.map((r) => ({ ...emptyCrusade(), ...r })))}
          />
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle>Crusades</CardTitle>
                <CardDescription>Add one block per crusade held — each has its own city, date and results. Held several similar ones? Fill one, then use “Duplicate”.</CardDescription>
              </div>
              <div className="flex gap-2 text-xs">
                <Badge variant="outline" className="gap-1"><Flame className="size-3" /> {totals.n}</Badge>
                <Badge variant="outline" className="gap-1"><Users className="size-3" /> {totals.att.toLocaleString()}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {typeof errors.crusades?.message === "string" && <p className="text-xs font-medium text-destructive">{errors.crusades.message}</p>}
              {crusadeArray.fields.map((f, i) => (
                <CrusadeRow key={f.id} index={i} form={form} errors={errors} fetchCities={fetchCities} countryReady={!!country}
                  onRemove={() => crusadeArray.remove(i)} onClone={() => cloneCrusade(i)} />
              ))}
              <Button type="button" variant="outline" onClick={() => crusadeArray.append(emptyCrusade())} className="w-full">
                <Plus /> Add crusade
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {step === 2 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
              <CardDescription>Check the summary, then submit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Summary label="Reporting as" value={orgType || "—"} />
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
                <Summary label="Crusades" value={totals.n} />
                <Summary label="Total attendance" value={totals.att.toLocaleString()} />
                <Summary label="Onsite attendance" value={totals.onsite.toLocaleString()} />
                <Summary label="Online attendance" value={totals.online.toLocaleString()} />
              </div>
              <div className="rounded-lg border divide-y">
                {(crusades || []).map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="truncate">{typeLabel(c.event_type)}{c.format === "online" ? " (online)" : ""} · {c.city} · {c.venue}</span>
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

      {/* Sticky nav --------------------------------------------------------*/}
      <div className="fixed inset-x-0 bottom-0 border-t bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div>
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={back}><ArrowLeft /> Back</Button>
            ) : (
              <span className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
            )}
          </div>
          {/* Distinct keys force separate DOM nodes — without them React mutates the
              Next button into the submit button mid-click and the click submits. */}
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
  );
}


// One crusade = one event. Essentials + core outcomes always visible; extended
// stats + metadata behind a labelled expander.
function CrusadeRow({ index, form, errors, fetchCities, countryReady, onRemove, onClone }) {
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

  // Online crusades have no onsite attendance; virtual types default the format.
  function onTypeChange(e) {
    if (!c.format && ONLINE_TYPES.includes(e.target.value)) setValue(p("format"), "online", { shouldValidate: true });
  }
  function onFormatChange(e) {
    if (e.target.value === "online") setValue(p("attendance"), 0);
  }

  return (
    <div className="relative animate-step-in rounded-lg border border-slate-200 border-l-4 border-l-violet-500 bg-white p-4 shadow-sm motion-reduce:animate-none">
      <button type="button" onClick={onRemove} title="Remove this crusade"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
        <Trash2 className="size-4" />
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Crusade type" required error={rowErr.event_type?.message} hint="What kind of crusade was it?">
          <Select {...register(p("event_type"), { onChange: onTypeChange })} aria-invalid={!!rowErr.event_type}>
            <option value="">Select…</option>
            {CRUSADE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
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
        <Field label="City" required error={rowErr.city?.message} hint="Where it held — start typing to search">
          <Controller control={control} name={p("city")} render={({ field }) => (
            <Combobox value={field.value} invalid={!!rowErr.city} disabled={!countryReady}
              placeholder={countryReady ? "Search city" : "Pick a country first"} searchPlaceholder="Type a city…" minChars={1} emptyText="No cities found"
              fetcher={fetchCities} onSelect={(o) => { field.onChange(o.label); setValue(p("city_place_id"), o.value); }} />
          )} />
        </Field>
        <Field label="Date" required error={rowErr.event_date?.message} hint="The day the crusade held">
          <Input type="date" {...register(p("event_date"))} aria-invalid={!!rowErr.event_date} />
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
        <Field label="Event name" required error={rowErr.event_name?.message} hint="A short label, e.g. 'Aba Street Reach'">
          <Input {...register(p("event_name"))} aria-invalid={!!rowErr.event_name} placeholder="Name this crusade" />
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
