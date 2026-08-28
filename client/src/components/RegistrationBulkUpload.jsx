import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, Loader2, ArrowUpRight, ArrowLeft, AlertTriangle, Check, ChevronDown } from "lucide-react";

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

// Non-critical notices (city fallbacks etc.) collapse into a pane; blocking
// validation errors stay fully visible below. Saves a tall wall of warnings on
// big files while keeping the useful info one click away.
function WarningList({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        {warnings.length} city {warnings.length === 1 ? "warning" : "warnings"} — click to expand
      </summary>
      <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto pl-0.5">
        {warnings.map((w, i) => (
          <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="size-3.5 shrink-0" /> {w}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function RegistrationBulkUpload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const portalToken = searchParams.get("portal") || "";
  const form = useForm({
    resolver: zodResolver(registrationSchema),
    defaultValues: { ...registrationDefaults, items: [{ event_type: "street", event_name: " ", event_date: "2099-01-01", venue: " ", expected_attendance: 1, minister_name: " ", country: "Nigeria", city: "Lagos" }] },
    mode: "onBlur",
  });
  const { register, control, watch, setValue, getValues, trigger, formState: { errors } } = form;

  const [manualZones, setManualZones] = React.useState(false);
  const [manualGroups, setManualGroups] = React.useState(false);
  const [file, setFile] = React.useState(null);
  const [preview, setPreview] = React.useState(null); // { ok, errors, warnings, summary, organization, items }
  const [busy, setBusy] = React.useState(false);
  const [portalScope, setPortalScope] = React.useState(null);
  const [portalError, setPortalError] = React.useState("");
  const inputRef = React.useRef(null);

  const orgType = watch("organization_type");
  const zone = watch("zone");
  const needsZone = ["zone", "group", "church", "cell"].includes(orgType);
  const needsGroup = ["group", "church", "cell"].includes(orgType);
  const needsChurch = ["church", "cell"].includes(orgType);
  const needsCell = orgType === "cell";

  const { fetchZones, fetchGroups, fetchNetworks, clearGroupCache } = useOrgData(zone);

  React.useEffect(() => {
    if (!portalToken) return;
    getJSON(`/zone-portal/${encodeURIComponent(portalToken)}`)
      .then((scope) => {
        setPortalScope(scope);
        setValue("organization_type", scope.kind === "network" ? "network" : "zone", { shouldValidate: true });
        setValue("zone", scope.kind === "zone" ? scope.zone : "", { shouldValidate: true });
        setValue("network_name", scope.kind === "network" ? scope.zone : "", { shouldValidate: true });
      })
      .catch((error) => setPortalError(error.message));
  }, [portalToken, setValue]);

  React.useEffect(() => {
    // Mirror the public form: organization entry fails closed if settings are
    // unavailable, so free-text zones/groups are never silently re-enabled.
    getJSON("/campaign-settings").then((s) => {
      setManualZones(s.manual_zones_enabled ?? false);
      setManualGroups(s.manual_groups_enabled ?? false);
    }).catch(() => {
      // Fail closed: default so free-text zones/groups are never silently enabled.
      setManualZones(false); setManualGroups(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(f, commit = false) {
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
      if (commit) fd.append("commit", "1");
      if (portalToken) fd.append("portal_token", portalToken);
      for (const k of ["organization_type", "zone", "group_name", "church_name", "cell_name", "network_name",
        "contact_name", "contact_email", "phone_country_code", "phone_number", "kingschat_username"]) {
        fd.append(k, v[k] ?? "");
      }
      const res = await fetch("/api/registrations/import", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Import failed");
      if (commit && body.committed) {
        toast.success(`${body.count} crusades registered successfully.`);
        setFile(null);
        setPreview(null);
        navigate(portalToken ? `/zone/${encodeURIComponent(portalToken)}` : "/crusade-registration");
        return;
      }
      setPreview(body);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Direct DB commit for files over the preview threshold (100 rows). The server
  // inserts every row in one transaction — same path as the manual form submit.
  function directSubmit() {
    if (!file) return;
    send(file, true);
  }

  function pick(f) {
    setFile(f);
    setPreview(null);
    if (f) setTimeout(() => send(f), 0); // auto-preview on select
  }

  function loadIntoForm() {
    if (!preview?.ok || !preview.items?.length) return;
    // The form caps at 500 crusades; the server rejects bigger files, but guard
    // here too so a stale preview can never write a freeze-the-browser draft.
    if (preview.items.length > 500) {
      toast.error(`Too many crusades (${preview.items.length}). The maximum per registration is 500 — split the file into smaller batches.`);
      return;
    }
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
    navigate(`/crusade-registration/register${portalToken ? `?portal=${encodeURIComponent(portalToken)}` : ""}`);
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
          {portalScope && (
            <div className="border-l-4 border-blue-600 bg-blue-50 px-4 py-3 text-sm text-blue-950">
              These registrations will be added to <strong>{portalScope.zone}</strong>.
            </div>
          )}
          {portalError && (
            <div className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900">{portalError}</div>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Who is registering?</CardTitle>
              <CardDescription>Tell us which organization these crusades belong to. This applies to every row in the spreadsheet.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Registering as" required error={errors.organization_type?.message}>
                <Select {...register("organization_type")} aria-invalid={!!errors.organization_type}
                  disabled={!!portalScope}
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
                      <Combobox value={field.value} invalid={!!errors.zone} caps disabled={!!portalScope} allowCreate={manualZones} createDescription="Submit this zone for admin review" placeholder="Select zone" searchPlaceholder="Search zones…" emptyText="No zones"
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

              {orgType === "network" && (
                <Field label="Network" required error={errors.network_name?.message}>
                  <Controller control={control} name="network_name" render={({ field }) => (
                    <Combobox value={field.value} invalid={!!errors.network_name} caps disabled={!!portalScope}
                      placeholder="Select network" searchPlaceholder="Search networks…"
                      emptyText="No networks found" fetcher={fetchNetworks}
                      onSelect={(o) => field.onChange(o.value)} />
                  )} />
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
                    preview.commit_required ? (
                      <div className="space-y-2">
                        <WarningList warnings={preview.warnings} />
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Check className="size-3.5 text-primary" /> {preview.summary?.crusades ?? 0} crusades validated. Files over 100 rows upload straight to the database.
                        </p>
                        <Button type="button" size="sm" onClick={directSubmit} disabled={busy}>
                          {busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload all {preview.summary?.crusades ?? 0} crusades directly
                        </Button>
                      </div>
                    ) : (
                    <div className="space-y-2">
                      <WarningList warnings={preview.warnings} />
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Check className="size-3.5 text-primary" /> Rows validated. Load them into the form to review and submit.
                      </p>
                      <Button type="button" size="sm" onClick={loadIntoForm} disabled={busy}>
                        Load {preview.items.length} crusade{preview.items.length === 1 ? "" : "s"} into form
                      </Button>
                    </div>
                    )
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
