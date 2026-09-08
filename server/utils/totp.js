// totp.js - RFC 6238 time-based one-time passwords on top of node's crypto.
//
// Deliberately dependency-free: TOTP is a HMAC, a counter and a truncation, and
// pulling a package in for it would be more code to trust, not less.

const crypto = require("crypto");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
/** How many 30s steps either side of now still count, for clock drift. */
const WINDOW = 1;

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];

  return output;
}

function base32Decode(input) {
  const clean = String(input || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/** A fresh 160-bit secret, base32 encoded the way authenticator apps expect. */
const generateSecret = () => base32Encode(crypto.randomBytes(20));

function codeForCounter(secret, counter) {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The code for right now - used by the tests and never by a route. */
const generateCode = (secret, at = Date.now()) =>
  codeForCounter(secret, Math.floor(at / 1000 / STEP_SECONDS));

/**
 * Constant-time comparison against the codes valid in the drift window, so a
 * wrong code cannot be narrowed down by timing.
 */
function verifyCode(secret, code) {
  const candidate = String(code || "").replace(/\D/g, "");
  if (!secret || candidate.length !== DIGITS) return false;

  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  let valid = false;

  for (let drift = -WINDOW; drift <= WINDOW; drift += 1) {
    const expected = codeForCounter(secret, counter + drift);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) valid = true;
  }

  return valid;
}

/** The `otpauth://` URI an authenticator app scans (or takes typed in). */
const otpauthUri = ({ secret, email, issuer = "Modern Todo" }) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

/** Recovery codes are stored hashed - the plain text is shown exactly once. */
const hashRecoveryCode = (code) =>
  crypto.createHash("sha256").update(String(code).toUpperCase().replace(/-/g, "")).digest("hex");

const generateRecoveryCodes = (count = 10) =>
  Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });

module.exports = {
  generateSecret,
  generateCode,
  verifyCode,
  otpauthUri,
  hashRecoveryCode,
  generateRecoveryCodes,
};
