// file-type.js - what a file actually is, and what it may be called.
//
// The client's Content-Type is a claim, not a fact. Since a stored file is
// streamed back to a browser - sometimes with an inline Content-Disposition -
// believing that claim would let an uploaded .mp4 that is really HTML run
// script on our own origin. Everything here works from the bytes instead.

const path = require("node:path");
const { MIME_EXTENSION } = require("../config/storage");

/** How many leading bytes the checks below need. */
const SNIFF_BYTES = 4096;

const startsWith = (buffer, bytes, offset = 0) => {
  if (buffer.length < offset + bytes.length) return false;
  for (let index = 0; index < bytes.length; index += 1) {
    if (buffer[offset + index] !== bytes[index]) return false;
  }
  return true;
};

const ascii = (buffer, offset, length) => buffer.subarray(offset, offset + length).toString("latin1");

/**
 * Identify a file from its leading bytes. Returns a mime from our own
 * allowlist, or null when the bytes match nothing we are willing to store.
 */
function sniffMime(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // --- images ---
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 4) === "WEBP") return "image/webp";

  // --- documents ---
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-

  // --- ISO base media (mp4 / mov / m4a / avif), distinguished by the brand ---
  if (ascii(buffer, 4, 4) === "ftyp") {
    const brand = ascii(buffer, 8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand === "qt  ") return "video/quicktime";
    if (brand.startsWith("M4A")) return "audio/mp4";
    return "video/mp4";
  }

  // --- matroska / webm: the DocType decides audio vs video ---
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    const head = buffer.subarray(0, Math.min(buffer.length, 256)).toString("latin1");
    if (head.includes("webm")) {
      // A webm with no video track is audio; the track type is too deep to read
      // from a sniff, so treat it as video and let the probe correct it later.
      return "video/webm";
    }
    return "video/webm";
  }

  // --- audio ---
  if (ascii(buffer, 0, 3) === "ID3") return "audio/mpeg";
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "audio/mpeg"; // bare MPEG frame sync
  if (ascii(buffer, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 4) === "WAVE") return "audio/wav";

  return null;
}

/**
 * A filename safe to store, log and put in a Content-Disposition.
 *
 * Path separators, control characters and leading dots all go; the extension is
 * taken from the mime we decided on rather than from whatever the client sent,
 * so the name can never disagree with the bytes.
 */
function safeFilename(rawName, mime) {
  const base = path
    .basename(String(rawName || "file"))
    .replace(/\.[^.]*$/, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120);

  const extension = MIME_EXTENSION[mime] || "";
  return `${base || "file"}${extension}`;
}

/**
 * Both halves of a Content-Disposition filename: the ASCII fallback every
 * client understands, and the RFC 5987 form that keeps the real characters.
 */
function dispositionFilename(filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

module.exports = { sniffMime, safeFilename, dispositionFilename, SNIFF_BYTES };
