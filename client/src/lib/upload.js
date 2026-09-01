import { responseErrorDetails } from "@/lib/api";

export function uploadForm(url, formData, { onProgress, timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const startedAt = performance.now();

    request.open("POST", `/api${url}`);
    request.responseType = "json";
    request.timeout = timeoutMs;

    request.upload.addEventListener("progress", (event) => {
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
      onProgress?.({
        phase: event.lengthComputable && event.loaded >= event.total ? "processing" : "uploading",
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : 0,
        percent: event.lengthComputable ? Math.min(100, Math.round((event.loaded / event.total) * 100)) : null,
        bytesPerSecond: event.loaded / elapsedSeconds,
      });
    });

    request.upload.addEventListener("load", () => {
      onProgress?.({ phase: "processing", percent: 100, loaded: formData.get("file")?.size || 0, total: formData.get("file")?.size || 0, bytesPerSecond: 0 });
    });

    request.addEventListener("load", () => {
      const body = request.response || (() => {
        try { return JSON.parse(request.responseText); } catch { return null; }
      })();
      if (request.status >= 200 && request.status < 300) {
        onProgress?.({ phase: "complete", percent: 100 });
        resolve(body);
        return;
      }
      const details = responseErrorDetails({ status: request.status, isFormData: true, body });
      const error = new Error(body?.error?.message || details.message);
      error.code = body?.error?.code || details.code;
      error.status = request.status;
      reject(error);
    });
    request.addEventListener("error", () => reject(new Error("Upload failed because the connection was interrupted. Please try again.")));
    request.addEventListener("timeout", () => reject(new Error("The server is still taking too long to process this file. Please try again with a smaller file.")));
    request.addEventListener("abort", () => reject(new Error("Upload cancelled.")));
    request.send(formData);
  });
}

export function formatUploadSpeed(bytesPerSecond = 0) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "";
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;
}

export async function downloadFile(url, fallbackName, { onProgress } = {}) {
  const startedAt = performance.now();
  onProgress?.({ phase: "generating", percent: null, loaded: 0, total: 0, bytesPerSecond: 0 });
  const response = await fetch(`/api${url}`);
  if (!response.ok) {
    let body = null;
    try { body = await response.json(); } catch { /* non-JSON gateway response */ }
    const details = responseErrorDetails({ status: response.status, body });
    throw new Error(body?.error?.message || details.message);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body?.getReader();
  const chunks = [];
  let loaded = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
      onProgress?.({
        phase: "downloading",
        loaded,
        total,
        percent: total ? Math.min(100, Math.round((loaded / total) * 100)) : null,
        bytesPerSecond: loaded / elapsedSeconds,
      });
    }
  } else {
    const buffer = await response.arrayBuffer();
    chunks.push(new Uint8Array(buffer));
    loaded = buffer.byteLength;
  }

  const disposition = response.headers.get("content-disposition") || "";
  const headerName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const blob = new Blob(chunks, { type: response.headers.get("content-type") || "application/octet-stream" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = headerName || fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  onProgress?.({ phase: "complete", percent: 100, loaded, total: total || loaded, bytesPerSecond: 0 });
}
