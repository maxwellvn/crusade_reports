import * as React from "react";
import { ImagePlus, Link2, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const MAX_REPORT_PHOTOS_BYTES = 30 * 1024 * 1024;
export const MAX_REPORT_PHOTO_FILES = 40;

const nf = new Intl.NumberFormat();

export const formatBytes = (bytes) => {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function totalPhotoBytes(files) {
  return (files || []).reduce((sum, file) => sum + (file.size || 0), 0);
}

export function photosLimitLabel() {
  return formatBytes(MAX_REPORT_PHOTOS_BYTES);
}

/** User-facing message when selected photos exceed the combined upload budget. */
export function photosOverLimitMessage(totalBytes = 0) {
  return `Selected photos total ${formatBytes(totalBytes)}, which is over the ${photosLimitLabel()} limit. Remove some photos or use photo links for the rest.`;
}

function isImageFile(file) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name || "");
}

/** Shared photo upload + photo/video link fields for every crusade report form. */
export function ReportMediaFields({
  photos = [],
  onPhotosChange,
  photoLinks = "",
  onPhotoLinksChange,
  videoLinks = "",
  onVideoLinksChange,
  photoLinksError,
  videoLinksError,
  className,
}) {
  const inputRef = React.useRef(null);
  const totalBytes = totalPhotoBytes(photos);
  const overLimit = totalBytes > MAX_REPORT_PHOTOS_BYTES;
  const nearLimit = !overLimit && totalBytes > MAX_REPORT_PHOTOS_BYTES * 0.9;

  function addFiles(fileList) {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;

    const accepted = [];
    const skippedType = [];
    const skippedLarge = [];

    for (const file of selected) {
      if (!isImageFile(file)) {
        skippedType.push(file.name || "file");
        continue;
      }
      if ((file.size || 0) > MAX_REPORT_PHOTOS_BYTES) {
        skippedLarge.push(`${file.name || "photo"} (${formatBytes(file.size)})`);
        continue;
      }
      accepted.push(file);
    }

    if (skippedType.length) {
      toast.error(
        skippedType.length === 1
          ? `"${skippedType[0]}" is not an image. Upload JPEG, PNG, WebP, GIF or HEIC only — use video links for videos.`
          : `${skippedType.length} files were skipped because they are not images. Upload JPEG, PNG, WebP, GIF or HEIC only.`
      );
    }
    if (skippedLarge.length) {
      toast.error(
        skippedLarge.length === 1
          ? `${skippedLarge[0]} is larger than ${photosLimitLabel()}. Compress it or share it with a photo link instead.`
          : `${skippedLarge.length} photos were skipped because each one must be ${photosLimitLabel()} or less.`
      );
    }
    if (!accepted.length) return;

    const next = [...photos, ...accepted];
    if (next.length > MAX_REPORT_PHOTO_FILES) {
      toast.error(`You can upload up to ${MAX_REPORT_PHOTO_FILES} photos per report. Remove some before adding more.`);
      onPhotosChange(next.slice(0, MAX_REPORT_PHOTO_FILES));
      return;
    }

    const nextTotal = totalPhotoBytes(next);
    onPhotosChange(next);
    if (nextTotal > MAX_REPORT_PHOTOS_BYTES) {
      toast.error(photosOverLimitMessage(nextTotal));
    } else if (accepted.length) {
      toast.success(
        accepted.length === 1
          ? `Added 1 photo (${formatBytes(accepted[0].size)}). ${formatBytes(nextTotal)} of ${photosLimitLabel()} used.`
          : `Added ${accepted.length} photos. ${formatBytes(nextTotal)} of ${photosLimitLabel()} used.`
      );
    }
  }

  function removeAt(index) {
    onPhotosChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className={cn(
        "rounded-lg border p-4",
        overLimit ? "border-red-300 bg-red-50/70" : "border-slate-200 bg-slate-50/60"
      )}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <ImagePlus className="size-4" /> Upload photos
            </p>
            <p className="mt-1 text-xs text-slate-500">
              JPEG, PNG, WebP, GIF or HEIC. All photos together must be {photosLimitLabel()} or less
              (up to {MAX_REPORT_PHOTO_FILES} files). Larger albums can be shared as photo links below.
            </p>
          </div>
          <p className={cn(
            "text-xs font-medium tabular-nums",
            overLimit ? "text-destructive" : nearLimit ? "text-amber-700" : "text-slate-600"
          )}>
            {nf.format(photos.length)} file{photos.length === 1 ? "" : "s"} · {formatBytes(totalBytes)} / {photosLimitLabel()}
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif"
          multiple
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => inputRef.current?.click()}>
          <ImagePlus className="size-4" /> Choose photos
        </Button>

        {overLimit && (
          <p role="alert" className="mt-2 text-xs font-medium text-destructive">
            {photosOverLimitMessage(totalBytes)}
          </p>
        )}
        {!overLimit && nearLimit && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            Almost at the limit — {formatBytes(MAX_REPORT_PHOTOS_BYTES - totalBytes)} remaining.
          </p>
        )}

        {photos.length > 0 && (
          <ul className="mt-3 divide-y rounded-md border border-slate-200 bg-white">
            {photos.map((file, index) => (
              <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-slate-700">{file.name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs tabular-nums text-slate-500">{formatBytes(file.size)}</span>
                  <button type="button" className="rounded p-1 text-slate-400 hover:bg-destructive/10 hover:text-destructive" onClick={() => removeAt(index)} aria-label={`Remove ${file.name}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Photo links"
          error={photoLinksError}
          hint="Optional — Google Drive or other photo album links, one per line"
        >
          <Textarea
            rows={4}
            maxLength={8000}
            value={photoLinks}
            onChange={(event) => onPhotoLinksChange(event.target.value)}
            placeholder={"https://drive.google.com/…\nhttps://…"}
          />
          <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Link2 className="size-3" /> Links for photos you did not upload here</span>
        </Field>
        <Field
          label="Video links"
          error={videoLinksError}
          hint="Optional — Drive, YouTube or other video links only (no video file uploads), one per line"
        >
          <Textarea
            rows={4}
            maxLength={8000}
            value={videoLinks}
            onChange={(event) => onVideoLinksChange(event.target.value)}
            placeholder={"https://drive.google.com/…\nhttps://youtu.be/…"}
          />
          <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Video className="size-3" /> Video files cannot be uploaded — paste links instead</span>
        </Field>
      </div>
    </div>
  );
}

export function buildReportFormData(payload, photos = []) {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  for (const file of photos) form.append("photos", file, file.name);
  return form;
}
