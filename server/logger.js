import pino from "pino";

// pino-pretty is a devDependency and absent from production images — use it
// only when it actually resolves, regardless of what NODE_ENV claims.
const isDev = process.env.NODE_ENV !== "production";
let prettyAvailable = false;
if (isDev) {
  try {
    await import("pino-pretty");
    prettyAvailable = true;
  } catch { /* pruned — fall through to plain JSON logs */ }
}

export const logger = pino(
  prettyAvailable
    ? {
        level: "debug",
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : { level: isDev ? "debug" : "info" }
);

const SENSITIVE_KEY = /(access.?token|authorization|cookie|password|secret|portal.?token|session.?token|email|phone|address|contact|kingschat)/i;

export function redactLogValue(value, key = "", seen = new WeakSet()) {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try { return JSON.stringify(redactLogValue(JSON.parse(value), key, seen)); } catch { /* ordinary text */ }
    }
    return value;
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item, key, seen));
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactLogValue(childValue, childKey, seen)]));
}

function redactUrl(value) {
  try {
    const url = new URL(String(value || ""), "http://local");
    for (const key of url.searchParams.keys()) if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, "[REDACTED]");
    return `${url.pathname}${url.search}`;
  } catch { return String(value || ""); }
}

// Wrap a route handler so thrown/rejected errors are logged with full context
// server-side, but the client only ever gets a safe message + code.
export function wrap(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

// Express error middleware — the single funnel for every API error.
export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const code = err.code || (status === 500 ? "INTERNAL" : "ERROR");

  logger.error(
    { err, code, status, method: req.method, url: redactUrl(req.originalUrl), body: redactLogValue(req.body) },
    err.message
  );

  // ponytail: user-safe payload only; stack/details stay in the log.
  res.status(status).json({
    error: {
      code,
      message: status === 500 ? "Something went wrong. Please try again." : err.message,
    },
  });
}

// Throw these from handlers for expected 4xx cases.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
