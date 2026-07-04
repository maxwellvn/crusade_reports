import * as React from "react";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, Loader2, ChevronDown, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Parallel path for high-volume reporters: fill the app-generated template, upload,
// see a preview + row errors, then LOAD the rows into the form. Nothing is saved
// here — the reporter still goes Next ▸ Review ▸ Submit like a manual entry.
export function ImportPanel({ onLoaded, getReportFields }) {
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState(null);
  const [preview, setPreview] = React.useState(null); // { ok, errors, summary, crusades }
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);

  async function send(f) {
    const fields = getReportFields?.() || {};
    if (!fields.organization_type || !fields.country) {
      toast.error("First choose who's reporting and the country (step 1) above.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      for (const [k, v] of Object.entries(fields)) fd.append(k, v ?? "");
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || "Import failed");
      setPreview(body);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  function load() {
    onLoaded?.(preview.crusades || []);
    toast.success(`Loaded ${preview.crusades?.length || 0} crusades into the form — check them, then click Next to review.`);
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    setOpen(false);
  }

  function pick(f) {
    setFile(f);
    setPreview(null);
    if (f) setTimeout(() => send(f), 0); // auto-preview on select
  }

  return (
    <Card>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-6 py-4 text-left">
        <span className="flex items-center gap-2 font-medium">
          <FileSpreadsheet className="size-4 text-primary" /> Have many crusades? Import a spreadsheet
        </span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <CardContent className="space-y-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            For lots of crusades at once. <strong>1.</strong> Make sure you've chosen who's reporting and the country above.
            <strong> 2.</strong> Download the template and fill one row per crusade (columns marked <span className="text-destructive">*</span> are required).
            <strong> 3.</strong> Upload it — you'll see a preview and any row-by-row errors, then the rows load into the form below for you to review and submit.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" asChild>
              <a href="/api/import/template" download><Download /> Download template</a>
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
                {preview.summary?.crusades ?? 0} crusades · {(preview.summary?.total_attendance ?? 0).toLocaleString()} attendance
                {" "}({(preview.summary?.onsite_attendance ?? 0).toLocaleString()} onsite · {(preview.summary?.online_attendance ?? 0).toLocaleString()} online)
                {preview.summary?.reporting_as ? ` · ${preview.summary.reporting_as}` : ""}
                {preview.summary?.country ? ` · ${preview.summary.country}` : ""}
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
                  <Button type="button" size="sm" onClick={load} disabled={busy}>
                    Load into form
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
      )}
    </Card>
  );
}
