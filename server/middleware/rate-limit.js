const rateLimit = require("express-rate-limit");

/**
 * Credential-stuffing brake on the unauthenticated routes. Disabled under test
 * so the suite does not trip it, except in the test that asserts it works.
 */
const makeLimiter = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max: Number(process.env.RATE_LIMIT_MAX || max),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.DISABLE_RATE_LIMIT === "true",
    // `standardHeaders` sets RateLimit-Reset; Retry-After is what the browser
    // and our own client read, so it is set explicitly and mirrored in the body.
    handler: (req, res) => {
      const retryAfter = Math.max(1, Math.ceil((req.rateLimit?.resetTime - Date.now()) / 1000) || Math.ceil(windowMs / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ message, retryAfter, requestId: req.id });
    },
  });

const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Try again in a few minutes.",
});

const registerLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Too many accounts created from this address. Try again later.",
});

/**
 * The font proxy makes an outbound request to Google on a cache miss, so it is
 * braked - generously, because a settings page legitimately previews several
 * fonts in a row while the user browses.
 */
const fontLimiter = makeLimiter({
  windowMs: 10 * 60 * 1000,
  max: 120,
  message: "Too many font lookups. Try again in a few minutes.",
});

module.exports = { loginLimiter, registerLimiter, fontLimiter };
