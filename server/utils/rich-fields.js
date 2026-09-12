// rich-fields.js - the one place a rich-text field is turned into what we store.
//
// Every rich field is really a pair: sanitized HTML and a plaintext mirror. The
// mirror is what the text index, CSV export, quick-add, search highlighting and
// every list card read, so if a write ever sets one without the other, search
// quietly rots and nothing fails loudly enough to notice.
//
// The defence against that is this file: every writer goes through
// `applyRichText`, and no controller derives a mirror itself.

const { resolveRichText } = require("./sanitize");

/**
 * The rich fields a record can have, as `plaintext -> html` pairs.
 * `inline` means marks only, which is what a title gets.
 */
const RICH_FIELDS = {
  title: { html: "titleHtml", inline: true, maxText: 100, maxHtml: 2000 },
  description: { html: "descriptionHtml", inline: false, maxText: 40000, maxHtml: 40000 },
};

/**
 * Normalise a request body in place, so both halves of every rich field agree.
 *
 * Whichever side the caller supplied wins, and the other is derived from it:
 * the editor sends HTML, while quick-add, import and the bulk tools send only
 * text. Fields the caller did not mention are left completely alone, so a
 * partial update never blanks anything.
 */
function applyRichText(body, fields = ["title", "description"]) {
  if (!body) return body;

  for (const name of fields) {
    const spec = RICH_FIELDS[name];
    if (!spec) continue;

    const html = body[spec.html];
    const text = body[name];
    if (html === undefined && text === undefined) continue;

    const resolved = resolveRichText({
      html,
      text,
      inline: spec.inline,
      maxText: spec.maxText,
      maxHtml: spec.maxHtml,
    });
    if (!resolved) continue;

    // A title must never be emptied by formatting alone - if the markup
    // carried no text, keep whatever plaintext the caller sent.
    if (spec.inline && !resolved.text && typeof text === "string") {
      resolved.text = text.slice(0, spec.maxText);
    }

    body[name] = resolved.text;
    body[spec.html] = resolved.html;
  }

  return body;
}

module.exports = { applyRichText, RICH_FIELDS };
