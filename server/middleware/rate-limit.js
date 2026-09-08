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
    handler: (req, res) => res.status(429).json({ message }),
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

module.exports = { loginLimiter, registerLimiter };
