import * as React from "react";
import { ArrowUpRight, LogOut, Trash2, UserPlus, Lock } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { deleteJSON, getJSON, postJSON, putJSON } from "@/lib/api";
import { useAdmin } from "@/components/AdminGate";

// Human-readable labels for the whitelisted landing-page routes. The server is
// the source of truth for which routes are allowed; this map just makes them
// readable in the dropdown. Falls back to the raw path if a route is missing.
const LANDING_PAGE_LABELS = {
  "/dashboard": "Reports dashboard",
  "/registrations/live": "Live registrations",
  "/registrations": "Registered crusades",
  "/crusades": "Reports",
  "/dashboard/zone-links": "Zone links",
};

// Page keys for the per-user access editor. Must match the server's
// ASSIGNABLE_PAGES list.
const ASSIGNABLE_PAGES = [
  { key: "dashboard", label: "Reports dashboard" },
  { key: "crusades", label: "Reports" },
  { key: "registrations", label: "Registered crusades" },
  { key: "registrations/live", label: "Live registrations" },
  { key: "dashboard/crusade-analysis", label: "Crusade analysis" },
  { key: "dashboard/zone-links", label: "Zone links" },
  { key: "dashboard/coverage", label: "Coverage map" },
  { key: "dashboard/country-coverage", label: "Country coverage" },
  { key: "dashboard/pastoral-checklist", label: "Zone checklist" },
  { key: "crusades/edit", label: "Edit reports" },
  { key: "registrations/manual-organizations", label: "Manual organisations" },
  { key: "dashboard/mission-nations", label: "Mission nations" },
  { key: "dashboard/media-training", label: "Media training" },
  { key: "dashboard/mission-trips", label: "Mission trips" },
  { key: "dashboard/upcoming-crusades", label: "Upcoming crusades" },
  { key: "dashboard/resources", label: "Resources admin" },
  { key: "dashboard/blue-elite", label: "Blue Elite" },
  { key: "registrations/blue-elite", label: "Blue Elite registrations" },
];

function SettingsSection({ title, description, children }) {
  return (
    <section className="grid gap-5 border-t border-slate-200 py-8 sm:grid-cols-[15rem_minmax(0,1fr)] sm:gap-10 sm:py-10">
      <div>
        <h3 className="text-base font-semibold tracking-[-0.015em] text-slate-950">{title}</h3>
        <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Settings() {
  const admin = useAdmin();
  const [accounts, setAccounts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [username, setUsername] = React.useState("");
  const [lookup, setLookup] = React.useState({ state: "idle", user: null, message: "" });
  const [reportingOpen, setReportingOpen] = React.useState(null);
  const [savingReporting, setSavingReporting] = React.useState(false);
  const [landingPage, setLandingPage] = React.useState("");
  const [landingOptions, setLandingOptions] = React.useState([]);
  const [savingLanding, setSavingLanding] = React.useState(false);
  const [manualZones, setManualZones] = React.useState(null);
  const [manualGroups, setManualGroups] = React.useState(null);
  const [manualCities, setManualCities] = React.useState(null);
  const [savingManualOrg, setSavingManualOrg] = React.useState(false);
  const [editingPermissions, setEditingPermissions] = React.useState(null);
  const [permissionDraft, setPermissionDraft] = React.useState([]);
  const [savingPermissions, setSavingPermissions] = React.useState(false);
  const [consolidation, setConsolidation] = React.useState(null);
  const [loadingConsolidation, setLoadingConsolidation] = React.useState(false);
  const [applyingConsolidation, setApplyingConsolidation] = React.useState(false);

  React.useEffect(() => {
    if (!admin?.is_super_admin) return;
    setLoadingConsolidation(true);
    getJSON("/admin/country-consolidation")
      .then(setConsolidation)
      .catch((error) => toast.error(error.message))
      .finally(() => setLoadingConsolidation(false));
  }, [admin]);

  async function applyConsolidation() {
    if (!confirm("Rewrite every stored country name to its canonical spelling? This updates all registration rows at once. Backups are taken automatically.")) return;
    setApplyingConsolidation(true);
    try {
      const result = await postJSON("/admin/country-consolidation/apply", { confirm: true });
      setConsolidation(result.after);
      toast.success(`Consolidated ${result.updated.registration_items} crusade rows and ${result.updated.registrations} registrations.`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setApplyingConsolidation(false);
    }
  }

  React.useEffect(() => {
    if (!admin?.is_super_admin) { setLoading(false); return; }
    getJSON("/auth/accounts")
      .then(setAccounts)
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [admin]);

  React.useEffect(() => {
    if (!admin?.is_super_admin) return;
    getJSON("/campaign-settings")
      .then((settings) => {
        setReportingOpen(settings.reporting_open);
        setLandingPage(settings.default_landing_page || "");
        setLandingOptions(Array.isArray(settings.landing_page_options) ? settings.landing_page_options : []);
        setManualZones(settings.manual_zones_enabled ?? false);
        setManualGroups(settings.manual_groups_enabled ?? false);
        setManualCities(settings.manual_cities_enabled ?? true);
      })
      .catch((error) => toast.error(error.message));
  }, [admin]);

  React.useEffect(() => {
    if (!admin?.is_super_admin) return;
    const normalized = username.trim().replace(/^@/, "");
    if (normalized.length < 2) {
      setLookup({ state: "idle", user: null, message: "" });
      return;
    }
    let current = true;
    setLookup({ state: "loading", user: null, message: "Searching KingsChat…" });
    const timer = setTimeout(() => {
      getJSON(`/auth/users/lookup?username=${encodeURIComponent(normalized)}`)
        .then((result) => {
          if (!current) return;
          if (result.found) setLookup({ state: "found", user: result.user, message: `${result.user.name} (@${result.user.username})` });
          else setLookup({ state: "missing", user: null, message: "No exact KingsChat username match was found." });
        })
        .catch((error) => { if (current) setLookup({ state: "missing", user: null, message: error.message }); });
    }, 350);
    return () => { current = false; clearTimeout(timer); };
  }, [admin, username]);

  async function addAccount(event) {
    event.preventDefault();
    if (!lookup.user) return toast.error("Select a verified KingsChat username first.");
    try {
      const account = await postJSON("/auth/accounts", { username: lookup.user.username });
      setAccounts((current) => current.some((row) => row.username === account.username) ? current : [...current, account].sort((a, b) => a.username.localeCompare(b.username)));
      setUsername("");
      toast.success(`@${account.username} can now access the dashboard.`);
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function removeAccount(username) {
    try {
      await deleteJSON(`/auth/accounts/${encodeURIComponent(username)}`);
      setAccounts((current) => current.filter((row) => row.username !== username));
      toast.success(`@${username} removed.`);
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function openPermissions(account) {
    try {
      const result = await getJSON(`/auth/permissions/${encodeURIComponent(account.username)}`);
      setEditingPermissions(account.username);
      setPermissionDraft(result.permissions);
    } catch (error) {
      toast.error(error.message);
    }
  }

  function togglePermission(key) {
    setPermissionDraft((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  }

  async function savePermissions() {
    setSavingPermissions(true);
    try {
      await putJSON(`/auth/permissions/${encodeURIComponent(editingPermissions)}`, { permissions: permissionDraft });
      toast.success(`Access updated for @${editingPermissions}.`);
      setEditingPermissions(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingPermissions(false);
    }
  }

  async function logout() {
    await postJSON("/auth/logout", {});
    // After logout the user lands on the configured default page — same place
    // /admin and the KingsChat callback send signed-in users.
    window.location.assign(landingPage || "/registrations/live");
  }

  async function toggleReporting() {
    const next = !reportingOpen;
    setSavingReporting(true);
    try {
      const settings = await putJSON("/campaign-settings", { reporting_open: next });
      setReportingOpen(settings.reporting_open);
      toast.success(settings.reporting_open ? "Reporting is now open." : "Reporting is now closed.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingReporting(false);
    }
  }

  async function saveLandingPage(value) {
    setSavingLanding(true);
    try {
      const settings = await putJSON("/campaign-settings", { default_landing_page: value });
      setLandingPage(settings.default_landing_page);
      setLandingOptions(Array.isArray(settings.landing_page_options) ? settings.landing_page_options : landingOptions);
      toast.success(`Default landing page set to ${LANDING_PAGE_LABELS[settings.default_landing_page] || settings.default_landing_page}.`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingLanding(false);
    }
  }

  async function toggleManualOrg(key) {
    const current = key === "zones" ? manualZones : key === "groups" ? manualGroups : manualCities;
    const next = !current;
    setSavingManualOrg(true);
    try {
      const settings = await putJSON("/campaign-settings", { [`manual_${key}_enabled`]: next });
      setManualZones(settings.manual_zones_enabled);
      setManualGroups(settings.manual_groups_enabled);
      setManualCities(settings.manual_cities_enabled);
      toast.success(`Manual ${key} ${settings[`manual_${key}_enabled`] ? "enabled" : "disabled"}.`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingManualOrg(false);
    }
  }

  if (!admin?.is_super_admin) {
    return <div className="mx-auto max-w-3xl border-y border-slate-200 py-8 text-sm text-muted-foreground">Only @maxwellvn can manage dashboard settings.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Settings" }]} />
      <div className="flex flex-col gap-5 pb-10 pt-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-normal tracking-[-0.03em] text-slate-950 sm:text-4xl">Settings</h2>
          <p className="mt-2 text-sm text-slate-600">Campaign controls and dashboard access for NOTC administrators.</p>
        </div>
        <div className="flex items-center gap-4">
          <p className="min-w-0 text-sm text-slate-500"><span className="block truncate font-medium text-slate-900">{admin.name}</span>@{admin.username}</p>
          <Button type="button" variant="outline" onClick={logout} className="rounded-full"><LogOut /> Sign out</Button>
        </div>
      </div>

      <SettingsSection title="Reporting access" description="Controls the public report form and the Reports tab on zone and network dashboards.">
        <div className="flex items-center justify-between gap-6 border-b border-slate-200 pb-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">{reportingOpen === null ? "Checking reporting status…" : `Reporting is ${reportingOpen ? "open" : "closed"}`}</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">{reportingOpen ? "Reports can be submitted from public and private reporting links." : "Report links are hidden and new submissions are rejected by the server."}</p>
          </div>
          <button type="button" role="switch" aria-checked={Boolean(reportingOpen)} disabled={reportingOpen === null || savingReporting}
            onClick={toggleReporting}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4 disabled:opacity-50 ${reportingOpen ? "border-slate-950 bg-slate-950" : "border-slate-300 bg-slate-200"}`}>
            <span className={`absolute top-1 block size-4 rounded-full bg-white transition-transform ${reportingOpen ? "translate-x-6" : "translate-x-1"}`} />
            <span className="sr-only">{reportingOpen ? "Close reporting" : "Open reporting"}</span>
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title="Default landing page" description="Choose where administrators arrive after KingsChat login, sign-out and the /admin shortcut.">
        <div className="max-w-xl space-y-3">
          <Field label="Landing page">
            <Select value={landingPage} disabled={savingLanding || !landingOptions.length} onChange={(e) => saveLandingPage(e.target.value)}>
              {landingOptions.map((path) => <option key={path} value={path}>{LANDING_PAGE_LABELS[path] || path}</option>)}
            </Select>
          </Field>
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            Current destination: <span className="font-semibold text-slate-900">{LANDING_PAGE_LABELS[landingPage] || landingPage || "Loading…"}</span>
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Manual organisation entry" description="Let registrants type a zone, group, or city name that isn't in the directory. Typed entries are flagged for admin review on the Manual organisations page.">
        <div className="space-y-6">
          <ManualOrgToggle label="Manual zones" description="Allow registrants to type a zone name not in the directory. Off by default — zones should come from the churches API." checked={manualZones} disabled={manualZones === null || savingManualOrg} onChange={() => toggleManualOrg("zones")} />
          <ManualOrgToggle label="Manual groups" description="Allow registrants to type a group name not in the directory. Off by default — groups should come from the churches API." checked={manualGroups} disabled={manualGroups === null || savingManualOrg} onChange={() => toggleManualOrg("groups")} />
          <ManualOrgToggle label="Manual cities" description="Allow registrants to type a city name not found in the search results. On by default — the create option only appears when no match is found." checked={manualCities} disabled={manualCities === null || savingManualOrg} onChange={() => toggleManualOrg("cities")} />
        </div>
      </SettingsSection>

      <SettingsSection title="Country consolidation" description="Clean up duplicate or variant country names left by bulk uploads. Dashboards already count them as one, but the stored values stay as typed until consolidated.">
        {loadingConsolidation ? <p className="text-sm text-muted-foreground">Scanning country values…</p>
          : consolidation ? (
          <div className="max-w-xl space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <dl className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Stored</dt>
                  <dd className="mt-1 text-xl font-semibold text-slate-950">{consolidation.distinctStored}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Canonical</dt>
                  <dd className="mt-1 text-xl font-semibold text-slate-950">{consolidation.canonicalTotal}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Represented</dt>
                  <dd className="mt-1 text-xl font-semibold text-slate-950">{consolidation.canonicalRepresented}</dd>
                </div>
              </dl>
              {consolidation.distinctStored > consolidation.canonicalTotal && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {consolidation.distinctStored - consolidation.canonicalTotal} duplicate spellings — {consolidation.affected.registration_items} crusade rows, {consolidation.affected.registrations} registrations affected.
                </p>
              )}
              {consolidation.distinctStored <= consolidation.canonicalTotal && (
                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">No duplicate country spellings found — stored values are already canonical.</p>
              )}
            </div>
            {consolidation.variantGroups.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-medium">Canonical</th>
                      <th className="px-3 py-2 font-medium">Stored variants</th>
                      <th className="px-3 py-2 text-right font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidation.variantGroups.map((group) => (
                      <tr key={group.canonical} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-900">{group.canonical}</td>
                        <td className="px-3 py-2 text-slate-600">{group.variants.join(", ")}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{group.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {consolidation.unresolvable.length > 0 && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">Unresolvable country names (kept as-is): {consolidation.unresolvable.join(", ")}</p>
            )}
            {consolidation.variantGroups.length > 0 && (
              <div className="flex items-center gap-3">
                <Button type="button" disabled={applyingConsolidation} onClick={applyConsolidation} className="rounded-full">
                  {applyingConsolidation ? "Consolidating…" : "Consolidate country names"}
                </Button>
                <p className="text-xs text-slate-500">Rewrites stored values to canonical spellings across all registrations.</p>
              </div>
            )}
          </div>
        ) : <p className="text-sm text-muted-foreground">Could not load country consolidation.</p>}
      </SettingsSection>

      <SettingsSection title="Dashboard accounts" description="Grant a KingsChat account access to the main administration dashboards. Use the access button to choose which pages each account can open.">
          <form onSubmit={addAccount} className="grid items-start gap-3 border-b border-slate-200 pb-6 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="KingsChat username" className="min-w-0">
              <Input name="username" required minLength={2} placeholder="@username" autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} />
              {lookup.message && <p aria-live="polite" className={`mt-2 text-xs ${lookup.state === "found" ? "text-slate-900" : lookup.state === "missing" ? "text-destructive" : "text-muted-foreground"}`}>
                {lookup.state === "found" ? `KingsChat user: ${lookup.message}` : lookup.message}
              </p>}
            </Field>
            <Button type="submit" disabled={lookup.state !== "found"} className="mt-6 rounded-full"><UserPlus /> Add account</Button>
          </form>
          <div aria-live="polite">
            {loading ? <p className="py-8 text-sm text-muted-foreground">Loading dashboard accounts…</p> : accounts.length ? accounts.map((account) => {
              const isSuper = account.username === admin.username;
              const isEditing = editingPermissions === account.username;
              return (
              <div key={account.username}>
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">@{account.username}{isSuper && <span className="ml-2 text-xs font-normal text-slate-400">(super admin)</span>}</p>
                    <p className="mt-1 text-xs text-slate-500">Added {account.created_at?.slice(0, 10) || "by the system"}{account.created_by ? ` · ${account.created_by}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!isSuper && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => isEditing ? setEditingPermissions(null) : openPermissions(account)} aria-label={`Manage access for @${account.username}`} className="text-slate-600 hover:text-blue-700">
                        <Lock /> {isEditing ? "Close" : "Access"}
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="sm" disabled={isSuper}
                      onClick={() => removeAccount(account.username)} aria-label={`Remove @${account.username}`} className="text-slate-600 hover:text-red-700">
                      <Trash2 /> Remove
                    </Button>
                  </div>
                </div>
                {isEditing && (
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-5">
                    <p className="mb-3 text-sm font-medium text-slate-700">Pages @{account.username} can access</p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {ASSIGNABLE_PAGES.map((page) => (
                        <label key={page.key} className="flex items-center gap-2.5 text-sm text-slate-700">
                          <input type="checkbox" checked={permissionDraft.includes(page.key)} onChange={() => togglePermission(page.key)} className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                          {page.label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Check the pages this account can open. Unchecked pages will be hidden and blocked. The default set (standard admin pages) is pre-checked for new accounts.</p>
                    <div className="mt-4 flex gap-2">
                      <Button type="button" size="sm" disabled={savingPermissions} onClick={savePermissions} className="rounded-full">{savingPermissions ? "Saving…" : "Save access"}</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingPermissions(null)} className="rounded-full">Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
              );
            }) : <p className="py-8 text-sm text-slate-500">No dashboard accounts have been added.</p>}
          </div>
      </SettingsSection>
    </div>
  );
}

function ManualOrgToggle({ label, description, checked, disabled, onChange }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-slate-200 pb-6 last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{label}</p>
        <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <button type="button" role="switch" aria-checked={Boolean(checked)} disabled={disabled}
        onClick={onChange}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4 disabled:opacity-50 ${checked ? "border-slate-950 bg-slate-950" : "border-slate-300 bg-slate-200"}`}>
        <span className={`absolute top-1 block size-4 rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
        <span className="sr-only">{checked ? `Disable ${label.toLowerCase()}` : `Enable ${label.toLowerCase()}`}</span>
      </button>
    </div>
  );
}
