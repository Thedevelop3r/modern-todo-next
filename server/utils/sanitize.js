// sanitize.js - the boundary between what a user types and what we store.
//
// Rich text is stored as HTML, which means every byte of it is attacker-
// controlled markup that we later hand to `dangerouslySetInnerHTML`. Nothing
// reaches the database without passing through here, and nothing is rendered
// that did not come out of here.
//
// The allowlist is deliberately small. The toolbar can produce exactly these
// tags and no others, so anything else is either a paste from elsewhere or an
// attack, and in both cases dropping it is the right answer.

const sanitizeHtml = require("sanitize-html");

/** A colour the toolbar could plausibly have produced. No `url()`, no `expression()`. */
const COLOR = /^(#(?:[0-9a-f]{3}|[0-9a-f]{6})|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|[a-z]{3,20})$/i;

/** A fixed scale rather than any number, so nothing can be sized off the page. */
const FONT_SIZE = /^(0?\.\d+|[1-9]\d?)(px|pt|em|rem|%)$/i;

/**
 * A font family list. Quoted names and the generic families only - this is the
 * same shape the Google Fonts picker produces.
 */
const FONT_FAMILY = /^["']?[\w\- ]{1,64}["']?(\s*,\s*["']?[\w\- ]{1,64}["']?){0,4}$/;

const ALIGN = /^(left|right|center|justify)$/;

/**
 * `style` is allowed, but only these properties and only these values.
 *
 * Banning the attribute outright would have been simpler, but the product
 * calls for font, size and colour controls, and those cannot be expressed as a
 * fixed set of class names. The safety therefore comes from validating every
 * value rather than from refusing the attribute.
 */
const ALLOWED_STYLES = {
  "*": {
    color: [COLOR],
    "background-color": [COLOR],
    "text-align": [ALIGN],
    "font-size": [FONT_SIZE],
    "font-family": [FONT_FAMILY],
  },
};

/** Block-level formatting: descriptions. */
const BLOCK_TAGS = [
  "p", "br", "strong", "em", "u", "s", "code", "pre",
  "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "a", "span", "mark",
];

/** Inline only: a title renders inside one-line cells, so it gets no blocks. */
const INLINE_TAGS = ["strong", "em", "u", "s", "code", "span", "mark"];

const baseOptions = {
  allowedAttributes: {
    "*": ["style", "dir", "lang", "class"],
    a: ["href", "title", "target", "rel"],
  },
  allowedStyles: ALLOWED_STYLES,
  // Never javascript:, never data: - those are how markup becomes execution.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  // Only the alignment classes the toolbar emits; anything else is dropped so
  // a paste cannot borrow our own styles to impersonate the app's chrome.
  allowedClasses: { "*": ["text-left", "text-right", "text-center", "text-justify"] },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
    // The editor emits <strong>/<em>, but a paste from elsewhere may not.
    // Normalising means a pasted bold survives instead of being stripped.
    b: "strong",
    i: "em",
    div: "p",
  },
  // Drop the content of anything removed, rather than leaving its text behind.
  nonTextTags: ["style", "script", "textarea", "option", "noscript"],
};

const BLOCK_OPTIONS = { ...baseOptions, allowedTags: BLOCK_TAGS };
const INLINE_OPTIONS = { ...baseOptions, allowedTags: INLINE_TAGS };

/** Clean a description: block formatting allowed. */
const sanitizeRich = (html) => (html ? sanitizeHtml(String(html), BLOCK_OPTIONS) : "");

/**
 * Clean a title: inline marks only.
 *
 * Block tags are turned into spaces first. Dropping them outright would run
 * their contents together - a pasted two-paragraph title would arrive as
 * "firstsecond" - and a title has nowhere to put a line break anyway.
 */
const sanitizeInline = (html) => {
  if (!html) return "";
  // Both the opening and closing tag become a space: replacing only the
  // closing one still lets "</h1><p>para" collapse into "...para".
  const flattened = String(html)
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|blockquote|pre|tr|td|th)\b[^>]*>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ");
  return sanitizeHtml(flattened, INLINE_OPTIONS).replace(/\s+/g, " ").trim();
};

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

/**
 * The plaintext mirror.
 *
 * This is not cosmetic: the `{title, description}` text index, CSV export,
 * quick-add, search highlighting and every list card read the plaintext, so a
 * rich-text write that did not maintain it would quietly break search.
 */
function htmlToText(html) {
  if (!html) return "";

  return String(html)
    // A paragraph break is a blank line and a <br> is a single newline: if both
    // collapsed to one "\n" the mirror could not tell them apart, and a
    // round trip through textToHtml would lose the paragraph structure.
    .replace(/<\/(p|div|h[1-6]|blockquote|pre)>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/** True when the markup carries no actual content - `<p></p>` and friends. */
const isEmptyHtml = (html) => htmlToText(html).length === 0;

/** Wrap plaintext as HTML, for the writers that never went near the editor. */
function textToHtml(text) {
  if (!text) return "";
  const escaped = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Resolve one rich-text field into the pair that gets stored.
 *
 * This is the single place the mirror is derived. Two call sites and the search
 * index would quietly rot, so every writer - the editor, quick-add, import,
 * bulk edit, templates - comes through here.
 */
function resolveRichText({ html, text, inline = false, maxText = 40000, maxHtml = 40000 }) {
  // The editor sent markup: it is authoritative, and the text follows from it.
  if (html !== undefined && html !== null && html !== "") {
    const clean = (inline ? sanitizeInline : sanitizeRich)(html).slice(0, maxHtml);
    return { html: clean, text: htmlToText(clean).slice(0, maxText) };
  }

  // Plaintext-only writer: the text is authoritative and the markup follows.
  if (text !== undefined && text !== null) {
    const plain = String(text).slice(0, maxText);
    return { html: plain ? textToHtml(plain).slice(0, maxHtml) : "", text: plain };
  }

  return null; // nothing to write - leave both fields alone
}

module.exports = {
  sanitizeRich,
  sanitizeInline,
  htmlToText,
  textToHtml,
  isEmptyHtml,
  resolveRichText,
  BLOCK_TAGS,
  INLINE_TAGS,
};
