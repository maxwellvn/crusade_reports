import { Router } from "express";
import { db } from "./db.js";
import { ApiError, wrap } from "./logger.js";
import { getDefaultLandingPage } from "./appSettings.js";

export const auth = Router();
const COOKIE = "kc_access_token";
const profileCache = new Map();
export const SUPER_ADMIN_USERNAME = "maxwellvn";

export const normalizeKingsChatUsername = (value) => String(value || "").trim().replace(/^@/, "").toLowerCase();
export const isSuperAdminUsername = (value) => normalizeKingsChatUsername(value) === SUPER_ADMIN_USERNAME;

function cookie(req, name) {
  const raw = String(req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return raw ? decodeURIComponent(raw.slice(name.length + 1)) : "";
}

function accessToken(req) {
  const bearer = String(req.get("authorization") || "");
  return cookie(req, COOKIE) || (bearer.startsWith("Bearer ") ? bearer.slice(7) : "");
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
  const token = accessToken(req);
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Sign in with KingsChat to continue.");
  const user = await fetchKingsChatProfile(token);
  if (!db.prepare("SELECT 1 FROM dashboard_accounts WHERE username = ? COLLATE NOCASE").get(user.username)) {
    throw new ApiError(403, "FORBIDDEN", `@${user.username} does not have dashboard access.`);
  }
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
  // ?pm=1 sets a short-lived cookie that tells the callback to auto-add the
  // signed-in KingsChat username to the dashboard allow list. Lets us share
  // /admin/pm as a self-service access link without manually approving each user.
  // sameSite=none + secure is required because KingsChat POSTs the token back
  // from accounts.kingsch.at — a cross-site POST, which browsers won't carry
  // sameSite=lax cookies on.
  if (req.query.pm === "1") {
    res.cookie("pm_auto_approve", "1", {
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
  // Auto-approve: if the pm_auto_approve cookie is set (from /admin/pm → login?pm=1),
  // add the signed-in KingsChat username to the allow list before the access check.
  const pmAutoApprove = cookie(req, "pm_auto_approve") === "1";
  if (pmAutoApprove) {
    res.clearCookie("pm_auto_approve", { httpOnly: true, sameSite: "none", secure: true, path: "/" });
    db.prepare("INSERT OR IGNORE INTO dashboard_accounts (username, created_by) VALUES (?, ?)").run(user.username, "pm_auto_approve");
  }
  if (!db.prepare("SELECT 1 FROM dashboard_accounts WHERE username = ? COLLATE NOCASE").get(user.username)) {
    return res.redirect(`${landing}?auth_error=${encodeURIComponent(`@${user.username} is not authorized`)}`);
  }
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  res.redirect(landing);
}));

auth.get("/me", wrap(async (req, res) => res.json(await authorizedUser(req))));

auth.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  res.json({ ok: true });
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
  res.json({ ok: true });
}));
