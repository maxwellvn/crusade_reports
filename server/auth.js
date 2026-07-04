import { ApiError } from "./logger.js";

// Admin gate for dashboards and data-read endpoints. Public writes (submit
// report, register crusades) and token-scoped zone portals stay open.
export function requireAdmin(req, _res, next) {
  const key = process.env.ADMIN_KEY;
  if (!key) return next(new ApiError(503, "ADMIN_UNCONFIGURED", "ADMIN_KEY is not set on the server"));
  if (req.get("x-admin-key") !== key) return next(new ApiError(401, "UNAUTHORIZED", "Admin key required"));
  next();
}
