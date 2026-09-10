import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { THEMES, THEME_IDS, DEFAULT_THEME_ID, themeById, themesIn } from "../lib/themes.ts";
import { preferencesSchema } from "../lib/validation.ts";

const css = readFileSync(new URL("../app/themes.css", import.meta.url), "utf8");
const fonts: Array<{ family: string }> = JSON.parse(
  readFileSync(new URL("../../shared/google-fonts.json", import.meta.url), "utf8")
);

// ------------------------------------------------------------ catalogue ----

test("the catalogue is 20 men, 20 women and 10 other, with unique ids", () => {
  assert.equal(THEMES.length, 50);
  assert.equal(new Set(THEME_IDS).size, 50);

  assert.equal(themesIn("men").length, 20);
  assert.equal(themesIn("women").length, 20);
  assert.equal(themesIn("other").length, 10);
  assert.equal(themesIn("all").length, 50);
});

test("the default theme exists, and an unknown id falls back to it", () => {
  assert.ok(THEME_IDS.includes(DEFAULT_THEME_ID));
  assert.equal(themeById(DEFAULT_THEME_ID).id, DEFAULT_THEME_ID);
  assert.equal(themeById("no-such-theme").id, DEFAULT_THEME_ID);
  assert.equal(themeById(undefined).id, DEFAULT_THEME_ID);
});

/**
 * The gallery would offer a theme that recolours nothing if a seed were added
 * without re-running `npm run themes`, so the generated CSS is checked here
 * rather than trusted.
 */
test("every theme has a light and a dark block in the generated CSS", () => {
  for (const id of THEME_IDS) {
    assert.ok(css.includes(`[data-theme="${id}"] {`), `missing light block for ${id}`);
    assert.ok(css.includes(`.dark[data-theme="${id}"] {`), `missing dark block for ${id}`);
  }
});

test("each generated block defines the full token set", () => {
  const required = ["--bg", "--surface", "--border", "--fg", "--fg-muted", "--primary", "--primary-fg", "--ring"];
  const blocks = css.match(/\[data-theme="[a-z-]+"\] \{[^}]+\}/g) || [];

  assert.equal(blocks.length, 100);
  for (const block of blocks) {
    for (const token of required) assert.ok(block.includes(`${token}:`), `${token} missing from a block`);
  }
});

test("every theme's default font is a real Google family", () => {
  const families = new Set(fonts.map((font) => font.family));
  for (const theme of THEMES) {
    if (theme.font) assert.ok(families.has(theme.font), `${theme.id} names an unknown font: ${theme.font}`);
  }
});

// ---------------------------------------------------------- preferences ----

test("the preferences schema accepts the new appearance fields", () => {
  assert.equal(preferencesSchema.safeParse({ themeId: "rose-quartz" }).success, true);
  assert.equal(preferencesSchema.safeParse({ themeId: "not-a-theme" }).success, false);

  assert.equal(preferencesSchema.safeParse({ fontFamily: "Cormorant Garamond" }).success, true);
  assert.equal(preferencesSchema.safeParse({ fontFamily: "" }).success, true);
  // A font name is letters, digits and spaces - nothing that could be a path.
  assert.equal(preferencesSchema.safeParse({ fontFamily: "../../etc/passwd" }).success, false);
  assert.equal(preferencesSchema.safeParse({ fontFamily: "x".repeat(65) }).success, false);
});

test("the UI scale gained two steps without loosening the enum", () => {
  for (const scale of ["xs", "small", "normal", "large", "xl"]) {
    assert.equal(preferencesSchema.safeParse({ uiScale: scale }).success, true, scale);
  }
  assert.equal(preferencesSchema.safeParse({ uiScale: "enormous" }).success, false);
});
