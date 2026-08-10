// Single fetch funnel. Throws Error(message) with .code on API errors so callers
// can toast a user-safe message; the HTTP-only KingsChat cookie is sent by the
// browser automatically and never exposed to client JavaScript.
export async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  let res;
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });
  } catch {
    const err = new Error(isFormData
      ? "Could not upload the report. Check your connection, keep photos within 50MB total, then try again."
      : "Could not reach the server. Check your connection and try again.");
    err.code = "NETWORK";
    throw err;
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
export const postForm = (path, formData) => api(path, { method: "POST", body: formData });
export const putJSON = (path, data) => api(path, { method: "PUT", body: JSON.stringify(data) });
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
