import * as React from "react";
import { LogOut, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteJSON, getJSON, postJSON, putJSON } from "@/lib/api";
import { useAdmin } from "@/components/AdminGate";

export function Settings() {
  const admin = useAdmin();
  const [accounts, setAccounts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [username, setUsername] = React.useState("");
  const [lookup, setLookup] = React.useState({ state: "idle", user: null, message: "" });
  const [reportingOpen, setReportingOpen] = React.useState(null);
  const [savingReporting, setSavingReporting] = React.useState(false);

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
      .then((settings) => setReportingOpen(settings.reporting_open))
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
    window.location.assign("/dashboard");
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

  if (!admin?.is_super_admin) {
    return <div className="mx-auto max-w-3xl"><Card><CardContent className="pt-6 text-sm text-muted-foreground">Only @maxwellvn can manage dashboard accounts.</CardContent></Card></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Settings" }]} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
          <p className="text-sm text-muted-foreground">Signed in as {admin.name} (@{admin.username})</p>
        </div>
        <Button type="button" variant="outline" onClick={logout}><LogOut /> Sign out</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Reporting access</CardTitle>
          <CardDescription>Controls the report form and Reports tab on every zone and network dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{reportingOpen === null ? "Loading reporting status…" : `Reporting is ${reportingOpen ? "open" : "closed"}`}</p>
            <p className="text-xs text-muted-foreground">When closed, report links are hidden and submissions are rejected by the server.</p>
          </div>
          <button type="button" role="switch" aria-checked={Boolean(reportingOpen)} disabled={reportingOpen === null || savingReporting}
            onClick={toggleReporting}
            className={`relative h-7 w-12 shrink-0 border transition-colors disabled:opacity-50 ${reportingOpen ? "border-emerald-700 bg-emerald-600" : "border-input bg-muted"}`}>
            <span className={`absolute top-1 block size-4 bg-background transition-transform ${reportingOpen ? "translate-x-6" : "translate-x-1"}`} />
            <span className="sr-only">{reportingOpen ? "Close reporting" : "Open reporting"}</span>
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dashboard access accounts</CardTitle>
          <CardDescription>Add a KingsChat username to grant access to all main administration dashboards.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addAccount} className="flex items-end gap-3 border-b pb-5">
            <Field label="KingsChat username" className="flex-1">
              <Input name="username" required minLength={2} placeholder="@username" autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} />
              {lookup.message && <p className={`mt-1 text-xs ${lookup.state === "found" ? "text-emerald-700" : lookup.state === "missing" ? "text-destructive" : "text-muted-foreground"}`}>
                {lookup.state === "found" ? `KingsChat user: ${lookup.message}` : lookup.message}
              </p>}
            </Field>
            <Button type="submit" disabled={lookup.state !== "found"}><UserPlus /> Add account</Button>
          </form>
          <div className="divide-y">
            {loading ? <p className="py-6 text-sm text-muted-foreground">Loading accounts…</p> : accounts.map((account) => (
              <div key={account.username} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">@{account.username}</p>
                  <p className="text-xs text-muted-foreground">Added {account.created_at?.slice(0, 10)}{account.created_by ? ` by ${account.created_by}` : ""}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={account.username === admin.username}
                  onClick={() => removeAccount(account.username)} aria-label={`Remove @${account.username}`}>
                  <Trash2 /> Remove
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
