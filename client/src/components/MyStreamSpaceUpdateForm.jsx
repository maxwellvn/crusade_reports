import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { useParams } from "react-router-dom";

import { getJSON, putJSON } from "@/lib/api";
import { formatWholeNumberInput, parseWholeNumberInput } from "@/lib/wholeNumberInput";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export function MyStreamSpaceUpdateForm() {
  const { token } = useParams();
  const [data, setData] = React.useState(null);
  const [crusades, setCrusades] = React.useState("");
  const [attendance, setAttendance] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getJSON(`/mystreamspace/update/${encodeURIComponent(token || "")}`);
      setData(result);
      setCrusades(formatWholeNumberInput(result.manual.crusades));
      setAttendance(formatWholeNumberInput(result.manual.online_attendance));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => { load(); }, [load]);

  function updateFormatted(setter, value) {
    const formatted = formatWholeNumberInput(value);
    if (formatted != null) setter(formatted);
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    const crusadeCount = parseWholeNumberInput(crusades);
    const onlineAttendance = parseWholeNumberInput(attendance);
    if (crusadeCount == null || onlineAttendance == null) {
      setError("Enter non-negative whole numbers for both fields.");
      return;
    }
    setSaving(true);
    try {
      const result = await putJSON(`/mystreamspace/update/${encodeURIComponent(token || "")}`, {
        crusades: crusadeCount,
        online_attendance: onlineAttendance,
      });
      setData(result);
      setCrusades(formatWholeNumberInput(result.manual.crusades));
      setAttendance(formatWholeNumberInput(result.manual.online_attendance));
      setMessage("MyStreamSpace totals were updated successfully.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-blue-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-5 sm:px-8">
          <img src="/logo.png" alt="Night of a Thousand Crusades" className="h-12 w-auto" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Night of a Thousand Crusades</p>
            <p className="mt-1 text-sm text-slate-500">MyStreamSpace reporting</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-700">Authorised update form</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-5xl">Update MyStreamSpace totals</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">Enter the cumulative MyStreamSpace crusades and online attendance. These figures are added to existing submitted MyStreamSpace reports across the NOTC dashboards.</p>

        {loading ? (
          <div className="mt-10 space-y-4" role="status" aria-label="Loading MyStreamSpace update form">
            <Skeleton className="h-24 rounded-none" />
            <Skeleton className="h-24 rounded-none" />
          </div>
        ) : error && !data ? (
          <div className="mt-10 border-y border-rose-200 bg-rose-50 px-6 py-8 text-sm leading-6 text-rose-800">{error}</div>
        ) : (
          <form onSubmit={submit} className="mt-10 space-y-6 border-y border-slate-200 bg-white px-5 py-8 sm:px-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="MyStreamSpace crusades">
                <Input type="text" inputMode="numeric" autoComplete="off" required value={crusades}
                  onChange={(event) => updateFormatted(setCrusades, event.target.value)} disabled={saving} />
              </Field>
              <Field label="Online attendance">
                <Input type="text" inputMode="numeric" autoComplete="off" required value={attendance}
                  onChange={(event) => updateFormatted(setAttendance, event.target.value)} disabled={saving} />
              </Field>
            </div>
            {message && <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="size-5" />{message}</p>}
            {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
            <Button type="submit" disabled={saving} className="rounded-full px-6">{saving ? "Saving…" : "Update totals"}</Button>
          </form>
        )}
      </div>
    </main>
  );
}
