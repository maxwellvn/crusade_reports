import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UploadProgress } from "@/components/UploadProgress";
import { downloadFile } from "@/lib/upload";

export function TemplateDownloadButton({ url, filename, disabled = false, variant = "outline", size, children = "Download template", className = "" }) {
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);

  async function download() {
    setBusy(true);
    try {
      await downloadFile(url, filename, { onProgress: (next) => setProgress({ ...next, kind: "download" }) });
      toast.success("Excel template downloaded.");
    } catch (error) {
      setProgress({ phase: "error", kind: "download", message: error.message });
      toast.error(error.message || "Could not download the Excel template.");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(null), 1800);
    }
  }

  return <div className={`space-y-2 ${className}`}>
    <Button type="button" variant={variant} size={size} disabled={disabled || busy} onClick={download}>
      {busy ? <Loader2 className="animate-spin" /> : <Download />} {children}
    </Button>
    <UploadProgress progress={progress} />
  </div>;
}
