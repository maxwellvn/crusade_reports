import * as React from "react";
import { ArrowUpRight, LogOut, Trash2, UserPlus } from "lucide-react";
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

      <SettingsSection title="Dashboard accounts" description="Grant a KingsChat account access to the main administration dashboards.">
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
            {loading ? <p className="py-8 text-sm text-muted-foreground">Loading dashboard accounts…</p> : accounts.length ? accounts.map((account) => (
              <div key={account.username} className="flex items-center justify-between gap-4 border-b border-slate-200 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">@{account.username}</p>
                  <p className="mt-1 text-xs text-slate-500">Added {account.created_at?.slice(0, 10) || "by the system"}{account.created_by ? ` · ${account.created_by}` : ""}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={account.username === admin.username}
                  onClick={() => removeAccount(account.username)} aria-label={`Remove @${account.username}`} className="shrink-0 text-slate-600 hover:text-red-700">
                  <Trash2 /> Remove
                </Button>
              </div>
            )) : <p className="py-8 text-sm text-slate-500">No dashboard accounts have been added.</p>}
          </div>
      </SettingsSection>
    </div>
  );
}
