import test from "node:test";
import assert from "node:assert/strict";

import {
  displayHtml,
  excerpt,
  htmlToText,
  isEmptyHtml,
  textToHtml,
  FONT_FAMILIES,
  FONT_SIZES,
  TEXT_COLORS,
} from "../lib/richtext.ts";

test("empty markup is recognised however it is spelled", () => {
  assert.equal(isEmptyHtml(""), true);
  assert.equal(isEmptyHtml(undefined), true);
  assert.equal(isEmptyHtml(null), true);
  assert.equal(isEmptyHtml("<p></p>"), true);
  assert.equal(isEmptyHtml("<p><br></p>"), true);
  assert.equal(isEmptyHtml("<p>   </p>"), true);
  assert.equal(isEmptyHtml("<p>x</p>"), false);
});

test("a paragraph break is a blank line and a br is a single newline", () => {
  // These must stay distinguishable, or a round trip loses the structure.
  assert.equal(htmlToText("<p>one</p><p>two</p>"), "one\n\ntwo");
  assert.equal(htmlToText("<p>one<br>two</p>"), "one\ntwo");
  assert.equal(htmlToText("<ul><li>one</li><li>two</li></ul>"), "one\ntwo");
});

test("entities are decoded rather than left as text", () => {
  assert.equal(htmlToText("<p>a &amp; b</p>"), "a & b");
  assert.equal(htmlToText("<p>&lt;tag&gt;</p>"), "<tag>");
  assert.equal(htmlToText("<p>&quot;quoted&quot;</p>"), '"quoted"');
  assert.equal(htmlToText("<p>&#65;</p>"), "A");
});

test("plaintext survives a full round trip through markup", () => {
  const cases = [
    "one line",
    "line one\nline two",
    "para one\n\npara two",
    "angle <brackets> and & ampersands",
  ];
  for (const text of cases) {
    assert.equal(htmlToText(textToHtml(text)), text, `round trip failed for: ${text}`);
  }
});

test("plaintext is escaped on the way in, so it cannot become markup", () => {
  const html = textToHtml('<script>alert(1)</script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("displayHtml prefers real markup and falls back to the plaintext mirror", () => {
  assert.equal(displayHtml("<p>rich</p>", "plain"), "<p>rich</p>");
  // A record written before rich text existed, or by import or quick-add.
  assert.equal(displayHtml("", "plain"), "<p>plain</p>");
  assert.equal(displayHtml("<p></p>", "plain"), "<p>plain</p>", "empty markup is not preferred over real text");
  assert.equal(displayHtml("", ""), "");
  assert.equal(displayHtml(undefined, undefined), "");
});

test("excerpt collapses to one line and truncates with an ellipsis", () => {
  assert.equal(excerpt("<p>one</p><p>two</p>", "one\n\ntwo"), "one two");
  assert.equal(excerpt("<p>only markup</p>"), "only markup");

  const long = "word ".repeat(80).trim();
  const short = excerpt("", long, 20);
  assert.equal(short.length, 20);
  assert.match(short, /…$/);
});

test("the toolbar's values are the ones the sanitizer will accept", () => {
  // The server validates colours as hex or a bare name, and sizes against a
  // unit pattern; anything here that failed those would be silently dropped.
  for (const color of TEXT_COLORS) {
    if (color.value === "") continue;
    assert.match(color.value, /^#[0-9a-f]{6}$/i, `${color.label} is not plain hex`);
  }
  for (const size of FONT_SIZES) {
    assert.match(size, /^\d+(px|pt|em|rem|%)$/, `${size} is not a simple size`);
  }
  for (const font of FONT_FAMILIES) {
    if (font.value === "") continue;
    assert.match(
      font.value,
      /^["']?[\w\- ]{1,64}["']?(\s*,\s*["']?[\w\- ]{1,64}["']?){0,4}$/,
      `${font.label} would be rejected by the sanitizer`
    );
  }
});
