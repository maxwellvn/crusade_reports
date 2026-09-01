import * as React from "react";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, ChevronDown, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadProgress } from "@/components/UploadProgress";
import { uploadForm } from "@/lib/upload";
import { TemplateDownloadButton } from "@/components/TemplateDownloadButton";

// Parallel path for high-volume reporters: fill the app-generated template, upload,
// see a preview + row errors, then LOAD the rows into the form. Nothing is saved
// here — the reporter still goes Next ▸ Review ▸ Submit like a manual entry.
export function ImportPanel({ onLoaded, getReportFields }) {
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState(null);
  const [preview, setPreview] = React.useState(null); // { ok, errors, summary, crusades }
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const inputRef = React.useRef(null);

  async function send(f) {
    const fields = getReportFields?.() || {};
    if (!fields.organization_type) {
      toast.error("First choose who's reporting (step 1) above.");
      return;
    }
    setBusy(true);
    setProgress({ phase: "uploading", percent: 0, bytesPerSecond: 0 });
    try {
      const fd = new FormData();
      fd.append("file", f);
      for (const [k, v] of Object.entries(fields)) fd.append(k, v ?? "");
      const body = await uploadForm("/import", fd, { onProgress: setProgress });
      setPreview(body);
    } catch (e) {
      setProgress({ phase: "error", message: e.message });
      toast.error(e.message);
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(null), 1200);
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
            For lots of crusades at once. <strong>1.</strong> Make sure you've chosen who's reporting above.
            <strong> 2.</strong> Download the template and fill one row per crusade — each row has its own Country (columns marked <span className="text-destructive">*</span> are required).
            <strong> 3.</strong> Upload it — you'll see a preview and any row-by-row errors, then the rows load into the form below for you to review and submit.
          </p>
          <div className="flex flex-wrap gap-2">
            <TemplateDownloadButton url="/import/template" filename="crusade-report-template.xlsx">Download template</TemplateDownloadButton>
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />} {file ? "Choose another file" : "Upload filled template"}
            </Button>
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden"
              onChange={(e) => pick(e.target.files?.[0] || null)} />
          </div>

          <UploadProgress progress={progress} />

          {preview && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="font-medium">
                {preview.summary?.crusades ?? 0} crusades · {(preview.summary?.total_attendance ?? 0).toLocaleString()} attendance
                {" "}({(preview.summary?.onsite_attendance ?? 0).toLocaleString()} onsite · {(preview.summary?.online_attendance ?? 0).toLocaleString()} online)
                {preview.summary?.reporting_as ? ` · ${preview.summary.reporting_as}` : ""}
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
