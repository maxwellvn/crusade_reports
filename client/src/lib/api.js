// Single fetch funnel. Throws Error(message) with .code on API errors so callers
// can toast a user-safe message; full server-side detail lives in server logs.
export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON (e.g. network/proxy failure) */
  }
  if (!res.ok) {
    const err = new Error(body?.error?.message || "Request failed. Please try again.");
    err.code = body?.error?.code || "NETWORK";
    throw err;
  }
  return body;
}

export const getJSON = (path) => api(path);
export const postJSON = (path, data) => api(path, { method: "POST", body: JSON.stringify(data) });
export const putJSON = (path, data) => api(path, { method: "PUT", body: JSON.stringify(data) });

// Debounce a promise-returning fn, cancelling stale calls (for typeaheads).
export function debounce(fn, ms = 250) {
  let t;
  return (...args) =>
    new Promise((resolve) => {
      clearTimeout(t);
      t = setTimeout(() => resolve(fn(...args)), ms);
    });
}
