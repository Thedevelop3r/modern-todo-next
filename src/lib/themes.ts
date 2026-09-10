import { THEME_CATALOGUE } from "./themes.generated.ts";
/**
 * The theme catalogue.
 *
 * themes.generated.ts is written by scripts/generate-themes.mjs from the same
 * shared/themes.json that produces src/app/themes.css and that
 * server/validation/schemas.js validates against - so a theme cannot appear in
 * the gallery without existing in the CSS. Run `npm run themes` after editing a
 * seed.
 *
 * Only the presentation fields are generated; the hues and chroma that build a
 * palette never reach the browser.
 */

export type ThemeCollection = "men" | "women" | "other";

export type Theme = {
  id: string;
  name: string;
  collection: ThemeCollection;
  /** Google family this theme reads best in; "" means the built-in Inter. */
  font: string;
};

export const THEMES: Theme[] = THEME_CATALOGUE;

export const THEME_IDS = THEMES.map((theme) => theme.id);

export const DEFAULT_THEME_ID = "indigo";

/** The built-in, self-hosted font. An empty fontFamily preference means this. */
export const DEFAULT_FONT_LABEL = "Inter";

export const THEME_COLLECTIONS: Array<{ value: ThemeCollection | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "other", label: "Other" },
];

export function themeById(id?: string): Theme {
  return THEMES.find((theme) => theme.id === id) || THEMES.find((theme) => theme.id === DEFAULT_THEME_ID)!;
}

export function themesIn(collection: ThemeCollection | "all"): Theme[] {
  return collection === "all" ? THEMES : THEMES.filter((theme) => theme.collection === collection);
}
