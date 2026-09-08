/**
 * One line per API request. Quiet in production and under test; passwords are
 * never written out.
 */
const ENABLED = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

async function checkinLogger(req, res, next) {
  if (!ENABLED) return next();

  const ip = req.headers["x-forwarded-for"] || req?.socket?.remoteAddress;
  const body = { ...(req.body || {}) };
  delete body.password;
  delete body.currentPassword;
  delete body.newPassword;

  const extras = [
    Object.keys(req.query || {}).length ? `query=${JSON.stringify(req.query)}` : "",
    Object.keys(body).length ? `body=${JSON.stringify(body)}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  console.log(`[${new Date().toISOString()}] ${ip} ${req.method} ${req.originalUrl} ${extras}`.trimEnd());
  next();
}

module.exports = { checkinLogger };
