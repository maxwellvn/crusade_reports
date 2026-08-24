// Single fetch funnel. Throws Error(message) with .code on API errors so callers
// can toast a user-safe message; the HTTP-only KingsChat cookie is sent by the
// browser automatically and never exposed to client JavaScript.
export const REPORT_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export function responseErrorDetails({ status, isFormData = false, body = null }) {
  const applicationMessage = body?.error?.message;
  const applicationCode = body?.error?.code;
  if (applicationMessage) return { message: applicationMessage, code: applicationCode || "NETWORK" };

  if (status === 413) {
    return {
      code: "PHOTOS_TOO_LARGE",
      message: isFormData
        ? "The server rejected these photos because the upload is too large. Select fewer or smaller photos (50MB total maximum), or add photo links instead."
        : "The request was rejected because it is too large. Reduce its size and try again.",
    };
  }
  if (status === 502) {
    return {
      code: isFormData ? "UPLOAD_STATUS_UNKNOWN" : "SERVER_UNAVAILABLE",
      message: isFormData
        ? "The server connection was interrupted while submitting. Your report may already have been saved. Refresh the dashboard and check for ‘Submitted’ before trying again."
        : "The server is temporarily unavailable. Please try again shortly.",
    };
  }
  if (status === 504) {
    return {
      code: isFormData ? "UPLOAD_STATUS_UNKNOWN" : "SERVER_TIMEOUT",
      message: isFormData
        ? "The server took too long to confirm the submission. Your report may already have been saved. Refresh the dashboard and check for ‘Submitted’ before trying again."
        : "The server took too long to respond. Please try again shortly.",
    };
  }
  return {
    code: applicationCode || "NETWORK",
    message: isFormData
      ? "Could not upload photos with this report. Check your connection and keep photos within 50MB total, then try again."
      : "Request failed. Please try again.",
  };
}

export async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const { timeoutMs = 0, signal: callerSignal, ...fetchOptions } = options;
  const timeoutController = timeoutMs > 0 ? new AbortController() : null;
  const forwardAbort = () => timeoutController?.abort(callerSignal?.reason);
  if (callerSignal?.aborted) forwardAbort();
  else callerSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = timeoutController
    ? globalThis.setTimeout(() => timeoutController.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs)
    : null;
  let res;
  try {
    res = await fetch(`/api${path}`, {
      ...fetchOptions,
      signal: timeoutController?.signal || callerSignal,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });
  } catch (cause) {
    const timedOut = timeoutController?.signal.aborted && !callerSignal?.aborted;
    const err = new Error(timedOut
      ? "The photo upload took too long and could not be confirmed. Refresh the dashboard before retrying; then use fewer or smaller photos, or add photo links instead."
      : isFormData
        ? "Could not upload the report. Check your connection, keep photos within 50MB total, then try again."
        : "Could not reach the server. Check your connection and try again.");
    err.code = timedOut ? "UPLOAD_TIMEOUT" : "NETWORK";
    err.cause = cause;
    throw err;
  } finally {
    if (timeout != null) globalThis.clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON (e.g. proxy HTML error page) */
  }
  if (!res.ok) {
    const details = responseErrorDetails({ status: res.status, isFormData, body });
    const err = new Error(details.message);
    err.code = details.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

export const getJSON = (path) => api(path);
export const postJSON = (path, data) => api(path, { method: "POST", body: JSON.stringify(data) });
export const postForm = (path, formData, options = {}) => api(path, { ...options, method: "POST", body: formData });
export const putJSON = (path, data) => api(path, { method: "PUT", body: JSON.stringify(data) });
export const putForm = (path, formData) => api(path, { method: "PUT", body: formData });
export const patchJSON = (path, data) => api(path, { method: "PATCH", body: JSON.stringify(data) });
export const deleteJSON = (path) => api(path, { method: "DELETE" });

// Authenticated file download with the same user-facing API errors as JSON
// requests. This avoids silent direct-link failures behind the production proxy.
export async function downloadFile(path, fallbackName = "download") {
  let response;
  try {
    response = await fetch(`/api${path}`);
  } catch {
    const error = new Error("Could not download the file. Check your connection and try again.");
    error.code = "NETWORK";
    throw error;
  }

  if (!response.ok) {
    let body = null;
    try { body = await response.json(); } catch { /* non-JSON proxy error */ }
    const error = new Error(body?.error?.message || "Could not export the registrations. Please try again.");
    error.code = body?.error?.code || "EXPORT_FAILED";
    error.status = response.status;
    throw error;
  }

  const disposition = response.headers.get("content-disposition") || "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const fileName = encodedName ? decodeURIComponent(encodedName) : plainName || fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Debounce a promise-returning fn, cancelling stale calls (for typeaheads).
export function debounce(fn, ms = 250) {
  let t;
  return (...args) =>
    new Promise((resolve) => {
      clearTimeout(t);
      t = setTimeout(() => resolve(fn(...args)), ms);
    });
}
