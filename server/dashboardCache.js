const cache = new Map();

export function cachedDashboardData(key, compute, ttlMs = 60_000) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  const value = compute();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
