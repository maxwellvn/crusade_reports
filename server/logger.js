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
    { err, code, status, method: req.method, url: req.originalUrl, body: req.body },
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
