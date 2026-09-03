import { AlertCircle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import { formatUploadSpeed } from "@/lib/upload";

export function UploadProgress({ progress }) {
  if (!progress) return null;
  const uploading = progress.phase === "uploading";
  const downloading = progress.phase === "downloading";
  const generating = progress.phase === "generating";
  const loading = progress.phase === "loading";
  const complete = progress.phase === "complete";
  const failed = progress.phase === "error";
  const percent = progress.percent ?? 0;
  const transferring = uploading || downloading;
  const speed = transferring ? formatUploadSpeed(progress.bytesPerSecond) : "";
  const loadedMb = downloading && progress.loaded ? `${(progress.loaded / (1024 * 1024)).toFixed(1)} MB` : "";
  const working = !transferring && !complete && !failed; // processing / loading rows

  return <div className={`space-y-2 rounded-md border p-3 text-sm ${failed ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"}`} role={failed ? "alert" : "status"} aria-live="polite">
    <div className="flex items-center justify-between gap-3">
      <span className={`flex items-center gap-2 font-medium ${failed ? "text-red-900" : "text-blue-950"}`}>
        {failed ? <AlertCircle className="size-4 text-red-700" /> : complete ? <CheckCircle2 className="size-4 text-emerald-600" /> : transferring ? <UploadCloud className="size-4 text-blue-700" /> : <Loader2 className="size-4 animate-spin text-blue-700" />}
        {failed ? (progress.message || "Transfer failed") : complete ? (progress.kind === "download" ? "Template downloaded" : "Upload completed") : generating ? "Preparing your Excel template…" : downloading ? `Downloading template… ${progress.percent == null ? loadedMb : `${percent}%`}` : uploading ? `Uploading file… ${percent}%` : loading ? (progress.message || "Loading rows…") : "Upload received — processing rows…"}
      </span>
      {speed && <span className="shrink-0 tabular-nums text-xs text-blue-800">{speed}</span>}
    </div>
    {!failed && <div className="h-2 overflow-hidden rounded-full bg-blue-100" aria-hidden="true">
      <div className={`h-full rounded-full bg-blue-600 transition-[width] duration-200 ${generating || (working && !loading) || (downloading && progress.percent == null) ? "animate-pulse" : ""}`} style={{ width: `${(transferring || loading) && progress.percent != null ? percent : 100}%` }} />
    </div>}
    {!failed && working && !loading && <p className="text-xs text-blue-800">Large spreadsheets can take a few minutes. Keep this page open; you will see a confirmation when processing finishes.</p>}
  </div>;
}
