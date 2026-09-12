// storage.js - the single source of truth for quotas, per-file caps and which
// file types this application is willing to hold.
//
// Both the upload path and the client read these numbers, so they live in one
// table rather than being spelled out at each call site.

/** Sizes below are written as multiples of these. */
const GB = 1024 ** 3;
const MB = 1024 ** 2;

/**
 * Account storage tiers. `base` is what every account starts on; the rest are
 * upgrades. Billing is not wired up yet - see stripe-integration.txt - so the
 * tier is currently set by the account owner.
 */
const TIERS = {
  base: { id: "base", label: "Free", quotaBytes: 1 * GB },
  "10gb": { id: "10gb", label: "10 GB", quotaBytes: 10 * GB },
  "25gb": { id: "25gb", label: "25 GB", quotaBytes: 25 * GB },
  "50gb": { id: "50gb", label: "50 GB", quotaBytes: 50 * GB },
  "100gb": { id: "100gb", label: "100 GB", quotaBytes: 100 * GB },
};

const TIER_IDS = Object.keys(TIERS);

/**
 * How large a single file may be, per kind. `plus` is the upgraded allowance;
 * it is orthogonal to the quota tier because the two are sold separately.
 */
const PER_FILE_CAPS = {
  base: { image: 15 * MB, video: 100 * MB, audio: 50 * MB, document: 50 * MB, pdf: 50 * MB },
  plus: { image: 25 * MB, video: 600 * MB, audio: 100 * MB, document: 1 * GB, pdf: 1 * GB },
};

const PER_FILE_TIER_IDS = Object.keys(PER_FILE_CAPS);

/**
 * The only media types this application stores. `kind` is derived from this
 * table and never from the client's Content-Type: a .mp4 that is really HTML
 * matters here, because a stored file is streamed back with an inline
 * Content-Disposition.
 */
const MIME_KIND = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/avif": "image",

  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",

  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/ogg": "audio",
  "audio/wav": "audio",
  "audio/webm": "audio",

  "application/pdf": "document",
};

const KINDS = ["image", "video", "audio", "document", "pdf"];

/** Extensions we hand back, keyed by the mime we stored the bytes as. */
const MIME_EXTENSION = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/webm": ".weba",
  "application/pdf": ".pdf",
};

/**
 * Types safe to serve with `Content-Disposition: inline`. Anything outside this
 * set is sent as an attachment, which is what stops an uploaded file being used
 * to run script on our own origin.
 */
const INLINE_SAFE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "application/pdf",
]);

/**
 * Bit flags on StoredFile. One integer beats five booleans here because these
 * are read together on every list row and every stream request.
 */
const FILE_FLAGS = {
  COMPRESSED: 1 << 0,
  GENERATED: 1 << 1,
  INLINE_SAFE: 1 << 2,
  PROBED: 1 << 3,
  RETAINED: 1 << 4,
};

const quotaForTier = (tier) => (TIERS[tier] || TIERS.base).quotaBytes;

/**
 * The cap for one file. `kind` has already been derived from the mime table, so
 * an unknown kind here is a programming error rather than user input.
 */
const capFor = (kind, perFileTier = "base") => {
  const table = PER_FILE_CAPS[perFileTier] || PER_FILE_CAPS.base;
  return table[kind] ?? table.document;
};

/** The largest single file any tier allows - busboy's hard limit. */
const MAX_ANY_FILE = Math.max(...Object.values(PER_FILE_CAPS.plus));

/** `image/png` -> "image", or null when we do not accept the type at all. */
const kindForMime = (mime) =>
  MIME_KIND[String(mime || "").toLowerCase().split(";")[0].trim()] || null;

module.exports = {
  GB,
  MB,
  TIERS,
  TIER_IDS,
  PER_FILE_CAPS,
  PER_FILE_TIER_IDS,
  MIME_KIND,
  MIME_EXTENSION,
  INLINE_SAFE_MIME,
  FILE_FLAGS,
  KINDS,
  MAX_ANY_FILE,
  quotaForTier,
  capFor,
  kindForMime,
};
