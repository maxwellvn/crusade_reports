import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, Loader2, ArrowUpRight, ArrowLeft, AlertTriangle, Check } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Combobox } from "@/components/Combobox";
import { registrationSchema, registrationDefaults } from "@/lib/schema";
import { PHONE_CODES } from "@/lib/constants";
import { useOrgData } from "@/lib/orgForm";
import { getJSON } from "@/lib/api";
import { DRAFT_KEY } from "@/components/RegistrationForm";
import "../landing.css"; // campaign fonts; reg theme lives in the .reg-page block

// Public bulk-upload page for crusade registrations. The org identity (who is
// registering + contact) is chosen here with the same pickers as the regular
// form; the spreadsheet carries only the per-crusade rows. The server parses,
// validates, canonicalizes the org against the directory, geocodes cities, and
// returns the rows — nothing is committed. On "Load into form" we write the
// parsed org + items into the same draft slot the RegistrationForm reads on
// mount, then route there so the reporter reviews and submits like a manual
// entry. This keeps the submit path identical for manual and bulk registrations.

export function RegistrationBulkUpload() {
  const navigate = useNavigate();
  const form = useForm({
    resolver: zodResolver(registrationSchema),
    defaultValues: { ...registrationDefaults, items: [{ event_type: "street", event_name: " ", event_date: "2099-01-01", venue: " ", expected_attendance: 1, minister_name: " ", country: "Nigeria", city: "Lagos" }] },
    mode: "onBlur",
  });
  const { register, control, watch, setValue, getValues, trigger, formState: { errors } } = form;

  const [manualZones, setManualZones] = React.useState(false);
  const [manualGroups, setManualGroups] = React.useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = React.useState(null); // null = loading, true/false = gate state
  const [allowedNetworks, setAllowedNetworks] = React.useState([]);
  const [file, setFile] = React.useState(null);
  const [preview, setPreview] = React.useState(null); // { ok, errors, warnings, summary, organization, items }
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);

  const orgType = watch("organization_type");
  const zone = watch("zone");
  // When the gate is closed, only the allowed networks (REON, TNI) can use bulk
  // upload — so the org type is locked to "network" and the other org fields are
  // hidden. The server still re-checks; this is just a UX hint.
  const restricted = bulkUploadOpen === false;
  const effectiveOrgType = restricted ? "network" : orgType;
  const needsZone = !restricted && ["zone", "group", "church", "cell"].includes(orgType);
  const needsGroup = !restricted && ["group", "church", "cell"].includes(orgType);
  const needsChurch = !restricted && ["church", "cell"].includes(orgType);
  const needsCell = !restricted && orgType === "cell";

  const { fetchZones, fetchGroups, fetchNetworks, clearGroupCache } = useOrgData(zone);

  React.useEffect(() => {
    // Mirror the public form: organization entry fails closed if settings are
    // unavailable, so free-text zones/groups are never silently re-enabled.
    getJSON("/campaign-settings").then((s) => {
      setManualZones(s.manual_zones_enabled ?? false);
      setManualGroups(s.manual_groups_enabled ?? false);
      setBulkUploadOpen(s.bulk_upload_open_to_all ?? false);
      setAllowedNetworks(Array.isArray(s.bulk_upload_allowed_networks) ? s.bulk_upload_allowed_networks : []);
      // Pre-lock the org type to network when the gate is closed, so the user
      // lands on the only org shape they can actually submit under.
      if (s.bulk_upload_open_to_all === false) setValue("organization_type", "network", { shouldValidate: true });
    }).catch(() => {
      // Fail closed: treat as restricted with the known allowed networks so the
      // page is still usable if the settings endpoint is temporarily down.
      setManualZones(false); setManualGroups(false);
      setBulkUploadOpen(false);
      setAllowedNetworks(["REON", "TNI"]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(f) {
    // Validate the org identity first — the server canonicalizes against the
    // directory, but we don't want to accept a sheet under an incomplete org.
    const ok = await trigger(["organization_type", "zone", "group_name", "church_name", "cell_name", "network_name",
      "contact_name", "contact_email", "phone_country_code", "phone_number"]);
    if (!ok) {
      toast.error("Please fix the highlighted organization fields first.");
      return;
    }
    setBusy(true);
    try {
      const v = getValues();
      const fd = new FormData();
      fd.append("file", f);
      for (const k of ["organization_type", "zone", "group_name", "church_name", "cell_name", "network_name",
        "contact_name", "contact_email", "phone_country_code", "phone_number", "kingschat_username"]) {
        fd.append(k, v[k] ?? "");
      }
      const res = await fetch("/api/registrations/import", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Import failed");
      setPreview(body);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  function pick(f) {
    setFile(f);
    setPreview(null);
    if (f) setTimeout(() => send(f), 0); // auto-preview on select
  }

  function loadIntoForm() {
    if (!preview?.ok || !preview.items?.length) return;
    const v = getValues();
    // Sync any canonicalized org fields the server returned (e.g. canonical zone
    // casing, manual flags) so the form the reporter lands on matches what the
    // server validated.
    const org = preview.organization || {};
    const values = {
      ...registrationDefaults,
      organization_type: org.organization_type || v.organization_type,
      zone: org.zone ?? v.zone,
      group_name: org.group_name ?? v.group_name,
      zone_manual: org.zone_manual ?? false,
      group_manual: org.group_manual ?? false,
      church_name: v.church_name,
      cell_name: v.cell_name,
      network_name: org.network_name ?? v.network_name,
      contact_name: v.contact_name,
      contact_email: v.contact_email,
      phone_country_code: v.phone_country_code,
      phone_number: v.phone_number,
      kingschat_username: v.kingschat_username,
      items: preview.items,
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ values, step: 1, batchType: "", savedAt: Date.now() }));
    } catch {
      toast.error("Could not save the loaded rows to this browser. Try again or register manually.");
      return;
    }
    toast.success(`Loaded ${preview.items.length} crusades into the form — review and submit.`);
    navigate("/crusade-registration/register");
  }

  return (
    <div className="reg-page">
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
        <div className="reg-card space-y-6 pb-28">
          <div className="space-y-2">
            <Link to="/crusade-registration/register" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> Register one crusade at a time instead
            </Link>
            <p className="reg-eyebrow text-sm font-semibold uppercase tracking-[0.35px]">Bulk registration</p>
            <h1 className="reg-title text-3xl tracking-[-0.9px] sm:text-4xl">Register many crusades at once.</h1>
            <p className="text-sm text-muted-foreground">
              Download the template, fill one row per crusade, upload it here, then review and submit. The organization
              and contact details below apply to every crusade in the file.
            </p>
          </div>

          {/* Step 1: who is registering (same fields as the regular form) */}
          <Card>
            <CardHeader>
              <CardTitle>Who is registering?</CardTitle>
              <CardDescription>Tell us which organization these crusades belong to. This applies to every row in the spreadsheet.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {restricted && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-sm text-slate-700">
                  Bulk upload is currently limited to <strong>{allowedNetworks.join(" and ")}</strong> networks.
                  Other organizations can <Link to="/crusade-registration/register" className="font-medium underline underline-offset-4">register one crusade at a time</Link> instead.
                </div>
              )}

              <Field label="Registering as" required error={errors.organization_type?.message}>
                <Select {...register("organization_type")} aria-invalid={!!errors.organization_type} disabled={restricted}
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
                      <Combobox value={field.value} invalid={!!errors.zone} caps allowCreate={manualZones} createDescription="Submit this zone for admin review" placeholder="Select zone" searchPlaceholder="Search zones…" emptyText="No zones"
                        fetcher={fetchZones} onSelect={(o) => { field.onChange(o.value); setValue("zone_manual", !!o.created); setValue("group_name", ""); setValue("group_manual", false); clearGroupCache(); }} />
                    )} />
                  </Field>
                  {needsGroup && (
                    <Field label="Group" required error={errors.group_name?.message}>
                      <Controller control={control} name="group_name" render={({ field }) => (
                        <Combobox value={field.value} invalid={!!errors.group_name} caps disabled={!zone}
                          allowCreate={manualGroups} createDescription="Submit this group for admin review" placeholder={zone ? "Select group or type one" : "Pick a zone first"} searchPlaceholder="Search groups…" emptyText="No groups"
                          fetcher={fetchGroups} onSelect={(o) => { field.onChange(o.label); setValue("group_manual", !!o.created); }} />
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

              {effectiveOrgType === "network" && (
                <Field label="Network" required error={errors.network_name?.message}>
                  {restricted ? (
                    <Select {...register("network_name")} aria-invalid={!!errors.network_name}
                      onChange={(e) => setValue("network_name", e.target.value, { shouldValidate: true })}>
                      <option value="">Select…</option>
                      {allowedNetworks.map((name) => <option key={name} value={name}>{name}</option>)}
                    </Select>
                  ) : (
                    <Controller control={control} name="network_name" render={({ field }) => (
                      <Combobox value={field.value} invalid={!!errors.network_name} caps
                        placeholder="Select network" searchPlaceholder="Search networks…"
                        emptyText="No networks found" fetcher={fetchNetworks}
                        onSelect={(o) => field.onChange(o.value)} />
                    )} />
                  )}
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

          {/* Step 2: download template + upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-primary" /> Upload your spreadsheet</CardTitle>
              <CardDescription>
                One row per crusade. Columns marked <span className="text-destructive">*</span> are required. The last 6 columns are for network registrations only — leave them blank otherwise.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" asChild>
                  <a href="/api/registrations/import/template" download><Download /> Download template</a>
                </Button>
                <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Upload />} {file ? "Choose another file" : "Upload filled template"}
                </Button>
                <input ref={inputRef} type="file" accept=".xlsx" className="hidden"
                  onChange={(e) => pick(e.target.files?.[0] || null)} />
              </div>

              {preview && (
                <div className="space-y-2 rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    {preview.summary?.crusades ?? 0} crusades · {(preview.summary?.expected_attendance ?? 0).toLocaleString()} expected attendance
                    {preview.summary?.registering_as ? ` · ${preview.summary.reporting_as ?? preview.summary.registering_as}` : ""}
                    {preview.summary?.countries?.length ? ` · ${preview.summary.countries.join(", ")}` : ""}
                  </p>
                  {preview.ok ? (
                    <div className="space-y-2">
                      {preview.warnings?.length > 0 && (
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                          {preview.warnings.map((w, i) => (
                            <li key={i} className="flex items-center gap-1.5"><AlertTriangle className="size-3.5 shrink-0" /> {w}</li>
                          ))}
                        </ul>
                      )}
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Check className="size-3.5 text-primary" /> Rows validated. Load them into the form to review and submit.
                      </p>
                      <Button type="button" size="sm" onClick={loadIntoForm} disabled={busy}>
                        Load {preview.items.length} crusade{preview.items.length === 1 ? "" : "s"} into form
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="flex items-center gap-1.5 font-medium text-destructive"><AlertTriangle className="size-4" /> Fix these, then re-upload:</p>
                      <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-destructive">
                        {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
