/**
 * Pure rich-text helpers.
 *
 * Kept free of React and of `next/*` imports so `npm run test:web` can cover
 * them - node strips the types and runs the file directly, which only works for
 * modules that resolve outside the bundler.
 *
 * Note what is *not* here: sanitising. That happens on the server, on write,
 * and is the only thing standing between a paste and `dangerouslySetInnerHTML`.
 * Doing it in the browser as well would suggest the client's copy mattered.
 */

/** True when markup carries no actual text - `<p></p>`, `<p><br></p>` and friends. */
export function isEmptyHtml(html?: string | null): boolean {
  if (!html) return true;
  return htmlToText(html).length === 0;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * The same derivation the server does, for the rare moment the client needs a
 * preview before a round trip. The server's copy remains authoritative.
 */
export function htmlToText(html?: string | null): string {
  if (!html) return "";

  return String(html)
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

/** Escape plaintext into markup, for a record written before rich text existed. */
export function textToHtml(text?: string | null): string {
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
 * What to render for a record that may predate rich text.
 *
 * Todos written before this feature - and any written by the import or
 * quick-add paths - have a plaintext field and nothing else, so the markup is
 * built from it rather than showing an empty body.
 */
export function displayHtml(html?: string | null, text?: string | null): string {
  if (html && !isEmptyHtml(html)) return html;
  return textToHtml(text);
}

/** A short, single-line summary for cards and list rows. */
export function excerpt(html?: string | null, text?: string | null, length = 160): string {
  const plain = text && text.length ? text : htmlToText(html);
  const oneLine = plain.replace(/\s+/g, " ").trim();
  return oneLine.length > length ? `${oneLine.slice(0, length - 1)}…` : oneLine;
}

/** The font sizes the toolbar offers. A fixed scale, matching the sanitizer. */
export const FONT_SIZES = ["12px", "14px", "16px", "18px", "24px", "32px"] as const;

/** Text colours the toolbar offers, as literal hex so the sanitizer accepts them. */
export const TEXT_COLORS = [
  { label: "Default", value: "" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Green", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Grey", value: "#6b7280" },
] as const;

/**
 * Fonts the toolbar offers.
 *
 * Deliberately families the browser already has, plus "Theme font", which
 * inherits whatever the account chose in Appearance. A free-text family here
 * would be loaded from Google Fonts, and the CSP forbids the browser from
 * reaching Google directly - the account-level picker goes through our own
 * /api/fonts proxy precisely because of that.
 */
export const FONT_FAMILIES = [
  { label: "Theme font", value: "" },
  { label: "Sans", value: "Arial, sans-serif" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Mono", value: "monospace" },
] as const;
