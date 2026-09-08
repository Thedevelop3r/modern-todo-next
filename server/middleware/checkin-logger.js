const crypto = require("crypto");

/**
 * Request id + one structured line per request.
 *
 * Every request gets an id, echoed as `X-Request-Id` and attached as `req.id`,
 * so a log line, an error response and a user's bug report can all be lined up.
 * The line is written when the response finishes, so it can carry the status
 * and the duration.
 *
 * Format follows the environment: JSON in production (machine-readable), a
 * short human line in development, silence under test.
 */
const MODE = process.env.NODE_ENV === "production" ? "json" : process.env.NODE_ENV === "test" ? "off" : "pretty";

/** Never log these, whatever route they arrive on. */
const SECRET_FIELDS = ["password", "currentPassword", "newPassword", "code", "data", "secret"];

function safeBody(body) {
  if (!body || typeof body !== "object") return undefined;
  const copy = { ...body };
  SECRET_FIELDS.forEach((field) => delete copy[field]);
  return Object.keys(copy).length ? copy : undefined;
}

async function checkinLogger(req, res, next) {
  req.id = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);

  if (MODE === "off") return next();

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const entry = {
      time: new Date().toISOString(),
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      // Present only once `auth` has run, which is exactly when it is useful.
      userId: req.user?._id ? String(req.user._id) : undefined,
      ip: req.headers["x-forwarded-for"] || req?.socket?.remoteAddress,
    };

    if (MODE === "json") {
      console.log(JSON.stringify(entry));
      return;
    }

    const body = safeBody(req.body);
    console.log(
      `[${entry.time}] ${entry.requestId.slice(0, 8)} ${entry.method} ${entry.path} ` +
        `${entry.status} ${entry.durationMs}ms${body ? ` body=${JSON.stringify(body)}` : ""}`
    );
  });

  next();
}

module.exports = { checkinLogger };
