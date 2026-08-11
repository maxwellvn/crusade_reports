import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db.js";
import { ApiError, wrap } from "./logger.js";
import { getDefaultLandingPage } from "./appSettings.js";

export const auth = Router();
const KINGSCHAT_COOKIE = "kc_access_token";
const SESSION_COOKIE = "dashboard_session";
export const DASHBOARD_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const profileCache = new Map();
export const SUPER_ADMIN_USERNAME = "maxwellvn";

// Pages that can be individually assigned to non-super-admin accounts. Super
// admins always have full access. New accounts (including /pm self-service)
// default to DEFAULT_PAGE_KEYS — the standard non-super-admin set. Once the
// super admin assigns specific pages, only those pages are accessible.
export const ASSIGNABLE_PAGES = [
  { key: "dashboard", label: "Reports dashboard", path: "/dashboard" },
  { key: "crusades", label: "Reports", path: "/crusades" },
  { key: "registrations", label: "Registered crusades", path: "/registrations" },
  { key: "registrations/live", label: "Live registrations", path: "/registrations/live" },
  { key: "dashboard/crusade-analysis", label: "Crusade analysis", path: "/dashboard/crusade-analysis" },
  { key: "dashboard/zone-links", label: "Zone links", path: "/dashboard/zone-links" },
  { key: "dashboard/coverage", label: "Coverage map", path: "/dashboard/coverage" },
  { key: "dashboard/country-coverage", label: "Country coverage", path: "/dashboard/country-coverage" },
  { key: "crusades/edit", label: "Edit reports", path: "/crusades" },
  { key: "registrations/manual-organizations", label: "Manual organisations", path: "/registrations/manual-organizations" },
  { key: "dashboard/mission-nations", label: "Mission nations", path: "/dashboard/mission-nations" },
  { key: "dashboard/media-training", label: "Media training", path: "/dashboard/media-training" },
  { key: "dashboard/mission-trips", label: "Mission trips", path: "/dashboard/mission-trips" },
  { key: "dashboard/upcoming-crusades", label: "Upcoming crusades", path: "/dashboard/upcoming-crusades" },
  { key: "dashboard/resources", label: "Resources admin", path: "/dashboard/resources" },
  { key: "dashboard/blue-elite", label: "Blue Elite", path: "/dashboard/blue-elite" },
  { key: "registrations/blue-elite", label: "Blue Elite registrations", path: "/registrations/blue-elite" },
  { key: "dashboard/database-protection", label: "Backups", path: "/dashboard/database-protection" },
];

// The pages new accounts get by default (the standard non-super-admin set).
export const DEFAULT_PAGE_KEYS = [
  "dashboard",
  "crusades",
  "registrations",
  "registrations/live",
  "dashboard/crusade-analysis",
  "dashboard/zone-links",
  "dashboard/coverage",
];

function getUserPermissions(username) {
  if (isSuperAdminUsername(username)) return ASSIGNABLE_PAGES.map((p) => p.key);
  const rows = db.prepare("SELECT page_key FROM dashboard_permissions WHERE username = ? COLLATE NOCASE ORDER BY page_key").all(username);
  return rows.length ? rows.map((r) => r.page_key) : [...DEFAULT_PAGE_KEYS];
}

export function canAccessPage(user, pageKey) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  return getUserPermissions(user.username).includes(pageKey);
}

export const normalizeKingsChatUsername = (value) => String(value || "").trim().replace(/^@/, "").toLowerCase();
export const isSuperAdminUsername = (value) => normalizeKingsChatUsername(value) === SUPER_ADMIN_USERNAME;

function cookie(req, name) {
  const raw = String(req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return raw ? decodeURIComponent(raw.slice(name.length + 1)) : "";
}

function accessToken(req) {
  const bearer = String(req.get("authorization") || "");
  return cookie(req, KINGSCHAT_COOKIE) || (bearer.startsWith("Bearer ") ? bearer.slice(7) : "");
}

const sessionTokenHash = (token) => createHash("sha256").update(token).digest("hex");

export function createDashboardSession(user, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  db.prepare(`
    INSERT INTO dashboard_sessions (token_hash, username, name, user_id, avatar, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionTokenHash(token), user.username, user.name || "", user.user_id || "", user.avatar || "", now + DASHBOARD_SESSION_MAX_AGE_MS);
  db.prepare("DELETE FROM dashboard_sessions WHERE expires_at <= ?").run(now);
  return token;
}

export function dashboardSessionUser(token, now = Date.now()) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT username, name, user_id, avatar
    FROM dashboard_sessions
    WHERE token_hash = ? AND expires_at > ?
  `).get(sessionTokenHash(token), now);
  if (!row) return null;
  return { ...row, is_super_admin: isSuperAdminUsername(row.username) };
}

async function fetchKingsChatProfile(token) {
  const cached = profileCache.get(token);
  if (cached?.expiresAt > Date.now()) return cached.user;
  let response;
  try {
    response = await fetch("https://connect.kingsch.at/api/profile", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError(503, "AUTH_UNAVAILABLE", "KingsChat authentication is temporarily unavailable.");
  }
  if (!response.ok) throw new ApiError(401, "UNAUTHORIZED", "Your KingsChat session has expired. Please sign in again.");
  const body = await response.json();
  const profile = body?.profile?.user;
  const username = normalizeKingsChatUsername(profile?.username);
  if (!username) throw new ApiError(401, "UNAUTHORIZED", "KingsChat did not return a username for this account.");
  const user = {
    username,
    name: profile.name || username,
    user_id: profile.user_id || "",
    avatar: profile.avatar || "",
    is_super_admin: isSuperAdminUsername(username),
  };
  profileCache.set(token, { user, expiresAt: Date.now() + 5 * 60 * 1000 });
  return user;
}

const normalizedUser = (user) => {
  const username = normalizeKingsChatUsername(user?.username);
  if (!username) return null;
  return { username, name: user.name || user.display_name || username, user_id: user.user_id || user.id || "" };
};

const decodeHtml = (value) => String(value || "")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export async function lookupKingsChatUser(token, requestedUsername, signedInUser) {
  const username = normalizeKingsChatUsername(requestedUsername);
  if (normalizeKingsChatUsername(signedInUser?.username) === username) return normalizedUser(signedInUser);
  let response;
  try {
    response = await fetch(`https://connect.kingsch.at/api/users?username=${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError(503, "AUTH_UNAVAILABLE", "KingsChat user search is temporarily unavailable.");
  }
  if (response.ok) {
    const body = await response.json();
    const user = normalizedUser(body?.user || body?.profile?.user || body);
    return user?.username === username ? user : null;
  }
  // This endpoint is not available to every KingsChat access token (it may
  // return 401/403 even while /api/profile works). Treat it as an optional
  // probe and continue to the public profile fallback below.

  // Some KingsChat accounts are discoverable through the authenticated
  // contacts directory even when the direct username probe is unavailable.
  try {
    const contactsResponse = await fetch("https://connect.kingsch.at/api/contacts", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (contactsResponse.ok) {
      const body = await contactsResponse.json();
      const contacts = Array.isArray(body) ? body : body?.contacts || [];
      const contact = contacts.map(normalizedUser).find((user) => user?.username === username);
      if (contact) return contact;
    }
  } catch { /* continue to the public profile fallback */ }

  try {
    const publicResponse = await fetch(`https://kingschat.online/user/${encodeURIComponent(username)}`, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(10000),
    });
    if (!publicResponse.ok) return null;
    const html = await publicResponse.text();
    const match = html.match(/<h1[^>]*visually-hidden[^>]*>\s*Follow\s+([\s\S]*?)\s+-\s+@([^\s<]+)\s+on\s+KingsChat/i);
    const foundUsername = normalizeKingsChatUsername(match?.[2]);
    if (!match || foundUsername !== username) return null;
    return { username: foundUsername, name: decodeHtml(match[1].replace(/<[^>]+>/g, "").trim()), user_id: "" };
  } catch {
    throw new ApiError(503, "AUTH_UNAVAILABLE", "KingsChat user search is temporarily unavailable.");
  }
}

async function authorizedUser(req) {
  const sessionToken = cookie(req, SESSION_COOKIE);
  let user = dashboardSessionUser(sessionToken);
  // Bearer tokens and pre-deployment cookies remain supported until users next
  // sign in, while normal browser sessions use the persistent portal session.
  if (!user) {
    const token = accessToken(req);
    if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in with KingsChat to continue.");
    user = await fetchKingsChatProfile(token);
  }
  if (!db.prepare("SELECT 1 FROM dashboard_accounts WHERE username = ? COLLATE NOCASE").get(user.username)) {
    throw new ApiError(403, "FORBIDDEN", `@${user.username} does not have dashboard access.`);
  }
  user.permissions = getUserPermissions(user.username);
  user.assignable_pages = ASSIGNABLE_PAGES;
  return user;
}

export async function requireAdmin(req, _res, next) {
  try {
    req.admin = await authorizedUser(req);
    next();
  } catch (error) {
    next(error);
  }
}

// Require an approved dashboard account with access to a specific page. This
// keeps API access aligned with the page-level access selected in Settings.
export function requirePageAccess(pageKey) {
  return async (req, _res, next) => {
    try {
      req.admin = await authorizedUser(req);
      if (!canAccessPage(req.admin, pageKey)) {
        throw new ApiError(403, "PAGE_FORBIDDEN", "You do not have access to this page.");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export async function requireSuperAdmin(req, _res, next) {
  try {
    req.admin = await authorizedUser(req);
    if (!req.admin.is_super_admin) throw new ApiError(403, "SUPER_ADMIN_REQUIRED", "Only @maxwellvn can manage dashboard accounts.");
    next();
  } catch (error) {
    next(error);
  }
}

auth.get("/kingschat/login", (req, res) => {
  const clientId = process.env.KINGSCHAT_CLIENT_ID || "com.kingschat";
  const redirectUri = process.env.KINGSCHAT_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/auth/kingschat/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    scopes: JSON.stringify(["conference_calls"]),
    redirect_uri: redirectUri,
    response_type: "token",
    post_redirect: "true",
  });
  // Leadership access links set a short-lived cookie that tells the callback to
  // auto-add the signed-in KingsChat username to the dashboard allow list.
  // sameSite=none + secure is required because KingsChat POSTs the token back
  // from accounts.kingsch.at — a cross-site POST, which browsers won't carry
  // sameSite=lax cookies on.
  const leadershipAccess = req.query.dg === "1" ? "dg" : req.query.pm === "1" ? "pm" : "";
  if (leadershipAccess) {
    res.cookie(`${leadershipAccess}_auto_approve`, "1", {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 5 * 60 * 1000,
      path: "/",
    });
  }
  res.redirect(`https://accounts.kingsch.at/?${params}`);
});

auth.all("/kingschat/callback", wrap(async (req, res) => {
  const token = String(req.body?.accessToken || req.body?.access_token || req.query?.accessToken || req.query?.access_token || "").trim();
  const landing = getDefaultLandingPage();
  if (!token) return res.redirect(`${landing}?auth_error=missing_token`);
  let user;
  try {
    user = await fetchKingsChatProfile(token);
  } catch {
    return res.redirect(`${landing}?auth_error=kingschat_verification_failed`);
  }
  // Auto-approve leadership users before the regular dashboard access check.
  const leadershipAccess = cookie(req, "dg_auto_approve") === "1" ? "dg" : cookie(req, "pm_auto_approve") === "1" ? "pm" : "";
  if (leadershipAccess) {
    res.clearCookie(`${leadershipAccess}_auto_approve`, { httpOnly: true, sameSite: "none", secure: true, path: "/" });
    db.prepare("INSERT OR IGNORE INTO dashboard_accounts (username, created_by) VALUES (?, ?)").run(user.username, `${leadershipAccess}_auto_approve`);
    // Seed default page permissions for leadership users so they start with the
    // standard non-super-admin set, not the full list.
    const permStmt = db.prepare("INSERT OR IGNORE INTO dashboard_permissions (username, page_key) VALUES (?, ?)");
    for (const key of DEFAULT_PAGE_KEYS) permStmt.run(user.username, key);
  }
  if (!db.prepare("SELECT 1 FROM dashboard_accounts WHERE username = ? COLLATE NOCASE").get(user.username)) {
    return res.redirect(`${landing}?auth_error=${encodeURIComponent(`@${user.username} is not authorized`)}`);
  }
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DASHBOARD_SESSION_MAX_AGE_MS,
    path: "/",
  };
  res.cookie(KINGSCHAT_COOKIE, token, cookieOptions);
  res.cookie(SESSION_COOKIE, createDashboardSession(user), cookieOptions);
  res.redirect(landing);
}));

auth.get("/me", wrap(async (req, res) => res.json(await authorizedUser(req))));

function clearSession(req, res) {
  const token = cookie(req, SESSION_COOKIE);
  if (token) db.prepare("DELETE FROM dashboard_sessions WHERE token_hash = ?").run(sessionTokenHash(token));
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };
  res.clearCookie(KINGSCHAT_COOKIE, options);
  res.clearCookie(SESSION_COOKIE, options);
}

auth.post("/logout", (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

// GET logout — clears the session cookie and redirects to the configured landing
// page. Lets you log out by visiting a URL directly (e.g. /api/auth/logout).
auth.get("/logout", (req, res) => {
  clearSession(req, res);
  res.redirect(getDefaultLandingPage());
});

auth.get("/accounts", requireSuperAdmin, (_req, res) => {
  res.json(db.prepare("SELECT username, created_by, created_at FROM dashboard_accounts ORDER BY username COLLATE NOCASE").all());
});

auth.get("/users/lookup", requireSuperAdmin, wrap(async (req, res) => {
  const username = normalizeKingsChatUsername(req.query.username);
  if (username.length < 2) throw new ApiError(422, "VALIDATION", "Type at least two characters.");
  const user = await lookupKingsChatUser(accessToken(req), username, req.admin);
  res.json({ found: Boolean(user), user });
}));

auth.post("/accounts", requireSuperAdmin, wrap(async (req, res) => {
  const username = normalizeKingsChatUsername(req.body?.username);
  if (!/^[a-z0-9._-]{2,100}$/i.test(username)) throw new ApiError(422, "VALIDATION", "Enter a valid KingsChat username.");
  const kingsChatUser = await lookupKingsChatUser(accessToken(req), username, req.admin);
  if (!kingsChatUser) throw new ApiError(422, "NOT_FOUND", "No exact KingsChat username match was found.");
  db.prepare("INSERT OR IGNORE INTO dashboard_accounts (username, created_by) VALUES (?, ?)").run(username, req.admin.username);
  // Seed default page permissions for manually added accounts.
  const permStmt = db.prepare("INSERT OR IGNORE INTO dashboard_permissions (username, page_key) VALUES (?, ?)");
  for (const key of DEFAULT_PAGE_KEYS) permStmt.run(username, key);
  res.status(201).json({ ...db.prepare("SELECT username, created_by, created_at FROM dashboard_accounts WHERE username = ?").get(username), name: kingsChatUser.name });
}));

auth.delete("/accounts/:username", requireSuperAdmin, wrap((req, res) => {
  const username = normalizeKingsChatUsername(req.params.username);
  if (username === SUPER_ADMIN_USERNAME) throw new ApiError(409, "SUPER_ADMIN", "The super admin account cannot be removed.");
  if (db.prepare("SELECT COUNT(*) AS n FROM dashboard_accounts").get().n <= 1) {
    throw new ApiError(409, "LAST_ACCOUNT", "At least one dashboard account is required.");
  }
  const result = db.prepare("DELETE FROM dashboard_accounts WHERE username = ? COLLATE NOCASE").run(username);
  if (!result.changes) throw new ApiError(404, "NOT_FOUND", "Dashboard account not found.");
  db.prepare("DELETE FROM dashboard_permissions WHERE username = ? COLLATE NOCASE").run(username);
  res.json({ ok: true });
}));

// Returns the list of pages that can be assigned to non-super-admin accounts.
auth.get("/pages", requireAdmin, (_req, res) => {
  res.json(ASSIGNABLE_PAGES);
});

// Returns the page keys assigned to a specific account. Super admins always
// return all assignable pages.
auth.get("/permissions/:username", requireSuperAdmin, wrap((req, res) => {
  const username = normalizeKingsChatUsername(req.params.username);
  res.json({ username, permissions: getUserPermissions(username) });
}));

// Replaces the full set of page permissions for an account. Send an empty
// array to reset to default (all assignable pages). Super admin permissions
// cannot be changed.
auth.put("/permissions/:username", requireSuperAdmin, wrap((req, res) => {
  const username = normalizeKingsChatUsername(req.params.username);
  if (username === SUPER_ADMIN_USERNAME) throw new ApiError(409, "SUPER_ADMIN", "Super admin permissions cannot be changed.");
  if (!db.prepare("SELECT 1 FROM dashboard_accounts WHERE username = ? COLLATE NOCASE").get(username)) {
    throw new ApiError(404, "NOT_FOUND", "Dashboard account not found.");
  }
  const requested = Array.isArray(req.body?.permissions) ? req.body.permissions : null;
  if (!requested) throw new ApiError(422, "VALIDATION", "Send a permissions array.");
  const validKeys = new Set(ASSIGNABLE_PAGES.map((p) => p.key));
  const clean = [...new Set(requested.filter((k) => validKeys.has(k)))];
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM dashboard_permissions WHERE username = ? COLLATE NOCASE").run(username);
    const stmt = db.prepare("INSERT OR IGNORE INTO dashboard_permissions (username, page_key) VALUES (?, ?)");
    for (const key of clean) stmt.run(username, key);
  });
  tx();
  res.json({ username, permissions: getUserPermissions(username) });
}));
