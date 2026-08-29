import * as React from "react";
import { ArrowUpRight, Copy, KeyRound, Link2, LogOut, RefreshCw, Trash2, UserPlus, Lock } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { deleteJSON, getJSON, postJSON, putJSON } from "@/lib/api";
import { formatWholeNumberInput, parseWholeNumberInput } from "@/lib/wholeNumberInput";
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
const NETWORK_INHERITANCE_OPTIONS = [
  ["Youths Aglow", "Include Youths Aglow crusade types submitted by other organisations, plus crusades registered by BLW zones."],
  ["TEEVOLUTION", "Include Teevolution crusade types submitted by other organisations."],
  ["Say Yes to Kids", "Include Say Yes to Kids crusade types submitted by other organisations."],
];

// Page keys for the per-user access editor. Must match the server's
// ASSIGNABLE_PAGES list.
const ASSIGNABLE_PAGES = [
  { key: "dashboard", label: "Reports dashboard" },
  { key: "crusades", label: "Reports" },
  { key: "dashboard/media-reports", label: "Media reports" },
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
  const [networkInheritance, setNetworkInheritance] = React.useState(null);
  const [savingNetworkInheritance, setSavingNetworkInheritance] = React.useState("");
  const [editingPermissions, setEditingPermissions] = React.useState(null);
  const [permissionDraft, setPermissionDraft] = React.useState([]);
  const [savingPermissions, setSavingPermissions] = React.useState(false);
  const [consolidation, setConsolidation] = React.useState(null);
  const [loadingConsolidation, setLoadingConsolidation] = React.useState(false);
  const [applyingConsolidation, setApplyingConsolidation] = React.useState(false);
  const [externalApiKey, setExternalApiKey] = React.useState(null);
  const [newExternalApiKey, setNewExternalApiKey] = React.useState("");
  const [savingExternalApiKey, setSavingExternalApiKey] = React.useState(false);
  const [myStreamSpace, setMyStreamSpace] = React.useState(null);
  const [myStreamSpaceCrusades, setMyStreamSpaceCrusades] = React.useState("");
  const [myStreamSpaceAttendance, setMyStreamSpaceAttendance] = React.useState("");
  const [savingMyStreamSpace, setSavingMyStreamSpace] = React.useState(false);
  const [myStreamSpaceLinkStatus, setMyStreamSpaceLinkStatus] = React.useState(null);
  const [newMyStreamSpaceUpdateUrl, setNewMyStreamSpaceUpdateUrl] = React.useState("");
  const [savingMyStreamSpaceLink, setSavingMyStreamSpaceLink] = React.useState(false);

  React.useEffect(() => {
    if (!admin?.is_super_admin) return;
    setLoadingConsolidation(true);
    getJSON("/admin/country-consolidation")
      .then(setConsolidation)
      .catch((error) => toast.error(error.message))
      .finally(() => setLoadingConsolidation(false));
  }, [admin]);

  React.useEffect(() => {
    if (!admin?.is_super_admin) return;
    getJSON("/auth/external-api-key")
      .then((result) => setExternalApiKey(result.active_key))
      .catch((error) => toast.error(error.message));
  }, [admin]);

  React.useEffect(() => {
    if (!admin?.is_super_admin) return;
    getJSON("/mystreamspace")
      .then((result) => {
        setMyStreamSpace(result);
        setMyStreamSpaceCrusades(formatWholeNumberInput(result.manual.crusades));
        setMyStreamSpaceAttendance(formatWholeNumberInput(result.manual.online_attendance));
      })
      .catch((error) => toast.error(error.message));
    getJSON("/mystreamspace/link")
      .then(setMyStreamSpaceLinkStatus)
      .catch((error) => toast.error(error.message));
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
        setNetworkInheritance(settings.network_dashboard_inherited_crusades || {});
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

  async function toggleNetworkInheritance(name) {
    const next = !networkInheritance?.[name];
    setSavingNetworkInheritance(name);
    try {
      const settings = await putJSON("/campaign-settings", { network_dashboard_inherited_crusades: { [name]: next } });
      setNetworkInheritance(settings.network_dashboard_inherited_crusades);
      toast.success(settings.network_dashboard_inherited_crusades[name]
        ? `${name} now includes its related crusades.`
        : `${name} now shows only its own registrations.`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingNetworkInheritance("");
    }
  }

  async function createExternalApiKey() {
    const action = externalApiKey ? "Rotating this key will immediately stop integrations using the current key. Continue?" : "Generate an API key for read-only data access?";
    if (!confirm(action)) return;
    setSavingExternalApiKey(true);
    try {
      const result = await postJSON("/auth/external-api-key", {});
      setExternalApiKey(result.active_key);
      setNewExternalApiKey(result.key);
      toast.success("API key generated. Copy it now; it will not be shown again.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingExternalApiKey(false);
    }
  }

  async function copyExternalApiKey() {
    try {
      await navigator.clipboard.writeText(newExternalApiKey);
      toast.success("API key copied.");
    } catch {
      toast.error("Could not copy the key. Select and copy it manually.");
    }
  }

  async function revokeExternalApiKey() {
    if (!confirm("Revoke the external API key? Any integration using it will stop immediately.")) return;
    setSavingExternalApiKey(true);
    try {
      await deleteJSON("/auth/external-api-key");
      setExternalApiKey(null);
      setNewExternalApiKey("");
      toast.success("API key revoked.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingExternalApiKey(false);
    }
  }

  async function saveMyStreamSpace(event) {
    event.preventDefault();
    const crusades = parseWholeNumberInput(myStreamSpaceCrusades);
    const onlineAttendance = parseWholeNumberInput(myStreamSpaceAttendance);
    if (crusades == null || onlineAttendance == null) {
      toast.error("Enter non-negative whole numbers for both MyStreamSpace values.");
      return;
    }
    setSavingMyStreamSpace(true);
    try {
      const result = await putJSON("/mystreamspace", { crusades, online_attendance: onlineAttendance });
      setMyStreamSpace(result);
      setMyStreamSpaceCrusades(formatWholeNumberInput(result.manual.crusades));
      setMyStreamSpaceAttendance(formatWholeNumberInput(result.manual.online_attendance));
      toast.success("MyStreamSpace totals updated across the dashboards.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingMyStreamSpace(false);
    }
  }

  function updateMyStreamSpaceField(setter, value) {
    const formatted = formatWholeNumberInput(value);
    if (formatted != null) setter(formatted);
  }

  async function generateMyStreamSpaceLink() {
    const action = myStreamSpaceLinkStatus?.active
      ? "Regenerating this link will immediately invalidate the current MyStreamSpace team link. Continue?"
      : "Generate a private MyStreamSpace update link?";
    if (!confirm(action)) return;
    setSavingMyStreamSpaceLink(true);
    try {
      const result = await postJSON("/mystreamspace/link", {});
      setMyStreamSpaceLinkStatus(result.status);
      setNewMyStreamSpaceUpdateUrl(`${window.location.origin}/mystreamspace/update/${result.token}`);
      toast.success("Private update link generated. Copy and share it with the MyStreamSpace team.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingMyStreamSpaceLink(false);
    }
  }

  async function copyMyStreamSpaceLink() {
    try {
      await navigator.clipboard.writeText(newMyStreamSpaceUpdateUrl);
      toast.success("MyStreamSpace update link copied.");
    } catch {
      toast.error("Could not copy the link. Select and copy it manually.");
    }
  }

  async function revokeMyStreamSpaceLink() {
    if (!confirm("Revoke the MyStreamSpace update link? Anyone using the current link will lose access immediately.")) return;
    setSavingMyStreamSpaceLink(true);
    try {
      const result = await deleteJSON("/mystreamspace/link");
      setMyStreamSpaceLinkStatus(result.status);
      setNewMyStreamSpaceUpdateUrl("");
      toast.success("MyStreamSpace update link revoked.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingMyStreamSpaceLink(false);
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

      <SettingsSection title="MyStreamSpace totals" description="Maintain the additional MyStreamSpace crusades and online attendance that cannot be imported automatically. These figures are added to existing MyStreamSpace reports.">
        <form onSubmit={saveMyStreamSpace} className="max-w-2xl space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Additional crusades">
              <Input type="text" required inputMode="numeric" autoComplete="off" value={myStreamSpaceCrusades}
                onChange={(event) => updateMyStreamSpaceField(setMyStreamSpaceCrusades, event.target.value)} disabled={!myStreamSpace || savingMyStreamSpace} />
            </Field>
            <Field label="Additional online attendance">
              <Input type="text" required inputMode="numeric" autoComplete="off" value={myStreamSpaceAttendance}
                onChange={(event) => updateMyStreamSpaceField(setMyStreamSpaceAttendance, event.target.value)} disabled={!myStreamSpace || savingMyStreamSpace} />
            </Field>
          </div>
          {myStreamSpace && (
            <div className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 text-sm sm:grid-cols-2">
              <div className="bg-slate-50 p-4">
                <p className="text-slate-500">Combined MyStreamSpace crusades</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{Number(myStreamSpace.totals.crusades).toLocaleString()}</p>
              </div>
              <div className="bg-slate-50 p-4">
                <p className="text-slate-500">Combined online attendance</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{Number(myStreamSpace.totals.online_attendance).toLocaleString()}</p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!myStreamSpace || savingMyStreamSpace} className="rounded-full">
              {savingMyStreamSpace ? "Saving…" : "Save MyStreamSpace totals"}
            </Button>
          </div>
          <p className="text-xs leading-5 text-slate-500">The read-only data API and individual report exports remain based only on submitted report records.</p>

          <div className="border-t border-slate-200 pt-5">
            <p className="text-sm font-semibold text-slate-950">MyStreamSpace team update link</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Generate a private link to let the MyStreamSpace team update these two numbers without administrator access.</p>
            {newMyStreamSpaceUpdateUrl && (
              <div className="mt-4 border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-950">Copy this link now. It will not be displayed again after leaving Settings.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={newMyStreamSpaceUpdateUrl} aria-label="New MyStreamSpace update link" className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={copyMyStreamSpaceLink} className="shrink-0"><Copy /> Copy link</Button>
                </div>
              </div>
            )}
            <div className="mt-4 border border-slate-200 bg-slate-50 p-4 text-sm">
              {myStreamSpaceLinkStatus?.active
                ? <p className="text-slate-700">An update link is active{myStreamSpaceLinkStatus.created_at ? `, generated ${myStreamSpaceLinkStatus.created_at.slice(0, 16).replace("T", " ")}.` : "."}</p>
                : <p className="text-slate-600">No MyStreamSpace update link is active.</p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" disabled={savingMyStreamSpaceLink || myStreamSpaceLinkStatus === null} onClick={generateMyStreamSpaceLink} className="rounded-full">
                <Link2 /> {myStreamSpaceLinkStatus?.active ? "Regenerate link" : "Generate link"}
              </Button>
              {myStreamSpaceLinkStatus?.active && (
                <Button type="button" variant="outline" disabled={savingMyStreamSpaceLink} onClick={revokeMyStreamSpaceLink} className="rounded-full"><RefreshCw /> Revoke link</Button>
              )}
            </div>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection title="Network dashboard visibility" description="Control whether selected network dashboards also see crusades submitted by other organisations under their related crusade type.">
        <div className="space-y-6">
          {NETWORK_INHERITANCE_OPTIONS.map(([name, enabledDescription]) => (
            <SettingsToggle key={name}
              label={name}
              description={networkInheritance?.[name] ? `On: ${enabledDescription}` : `Off: ${name} shows only crusades explicitly registered under ${name}.`}
              checked={Boolean(networkInheritance?.[name])}
              disabled={networkInheritance === null || Boolean(savingNetworkInheritance)}
              onChange={() => toggleNetworkInheritance(name)} />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="External data API" description="Create one read-only key for trusted server-to-server integrations. Only the super admin can manage this key.">
        <div className="max-w-2xl space-y-4">
          <p className="text-sm leading-6 text-slate-600">Use <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">GET /api/reports</code> or <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">GET /api/registrations</code> with an <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">X-API-Key</code> header. Results are read-only, exclude personal contact details, and use cursor pagination with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">limit</code> (maximum 500) and <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">cursor</code>.</p>
          {newExternalApiKey && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-950">Copy this key now — it will not be displayed again.</p>
              <div className="mt-3 flex gap-2">
                <Input readOnly value={newExternalApiKey} aria-label="New external API key" className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={copyExternalApiKey} className="shrink-0"><Copy /> Copy</Button>
              </div>
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            {externalApiKey ? <>
              <p className="font-semibold text-slate-950">Active key: <span className="font-mono">{externalApiKey.key_prefix}</span></p>
              <p className="mt-1 text-slate-600">Created {externalApiKey.created_at?.slice(0, 16)?.replace("T", " ")} by @{externalApiKey.created_by}. {externalApiKey.last_used_at ? `Last used ${externalApiKey.last_used_at.slice(0, 16).replace("T", " ")}.` : "Not used yet."}</p>
            </> : <p className="text-slate-600">No external API key is active.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={savingExternalApiKey} onClick={createExternalApiKey} className="rounded-full"><KeyRound /> {externalApiKey ? "Rotate API key" : "Generate API key"}</Button>
            {externalApiKey && <Button type="button" variant="outline" disabled={savingExternalApiKey} onClick={revokeExternalApiKey} className="rounded-full"><RefreshCw /> Revoke key</Button>}
          </div>
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
          <SettingsToggle label="Manual zones" description="Allow registrants to type a zone name not in the directory. Off by default — zones should come from the churches API." checked={manualZones} disabled={manualZones === null || savingManualOrg} onChange={() => toggleManualOrg("zones")} />
          <SettingsToggle label="Manual groups" description="Allow registrants to type a group name not in the directory. Off by default — groups should come from the churches API." checked={manualGroups} disabled={manualGroups === null || savingManualOrg} onChange={() => toggleManualOrg("groups")} />
          <SettingsToggle label="Manual cities" description="Allow registrants to type a city name not found in the search results. On by default — the create option only appears when no match is found." checked={manualCities} disabled={manualCities === null || savingManualOrg} onChange={() => toggleManualOrg("cities")} />
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

function SettingsToggle({ label, description, checked, disabled, onChange }) {
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
