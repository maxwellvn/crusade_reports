// Single fetch funnel. Throws Error(message) with .code on API errors so callers
// can toast a user-safe message; the HTTP-only KingsChat cookie is sent by the
// browser automatically and never exposed to client JavaScript.
export const REPORT_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

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
    let message = body?.error?.message;
    let code = body?.error?.code || "NETWORK";
    if (!message && (res.status === 413 || res.status === 502 || res.status === 504)) {
      message = isFormData
        ? "The photo upload was rejected as too large. Keep all photos within 50MB total, or use photo links for larger albums."
        : "The request was rejected as too large. Please try again with a smaller upload.";
      code = "PHOTOS_TOO_LARGE";
    }
    if (!message && isFormData) {
      message = "Could not upload photos with this report. Keep photos within 50MB total and try again.";
    }
    const err = new Error(message || "Request failed. Please try again.");
    err.code = code;
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

// Debounce a promise-returning fn, cancelling stale calls (for typeaheads).
export function debounce(fn, ms = 250) {
  let t;
  return (...args) =>
    new Promise((resolve) => {
      clearTimeout(t);
      t = setTimeout(() => resolve(fn(...args)), ms);
    });
}
