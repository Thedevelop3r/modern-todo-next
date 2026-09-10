"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { DEFAULT_THEME_ID } from "@/lib/themes";

/**
 * Applies the saved appearance to <html>, in the same shape as UiScaleEffect:
 * set on change, cleared on unmount so the signed-out pages fall back to the
 * defaults in globals.css.
 *
 * A theme is only a `data-theme` attribute - the palettes themselves are static
 * CSS in src/app/themes.css, so switching one is a single attribute write and
 * the browser repaints from a stylesheet it already has.
 */

/** Read by the pre-paint script in layout.tsx, so a reload never flashes. */
export const THEME_STORAGE_KEY = "modern-todo:themeId";
export const FONT_STORAGE_KEY = "modern-todo:fontFamily";

export const FONT_LINK_ID = "google-font";

/** Where the proxied stylesheet for a family lives. See server/routes/font.route.js. */
export const fontCssHref = (family: string) => `/api/fonts/css?family=${encodeURIComponent(family)}`;

export function ThemeEffect({ themeId, theme }: { themeId?: string; theme?: ThemePreference }) {
  const { setTheme } = useTheme();

  React.useEffect(() => {
    const id = themeId || DEFAULT_THEME_ID;
    document.documentElement.dataset.theme = id;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      // A blocked storage only costs a flash on the next load.
    }
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [themeId]);

  // The account is the source of truth for light/dark too, so the mode follows
  // the user to a new browser instead of being stranded in next-themes' own
  // localStorage. This runs once per sign-in, not on every render.
  const applied = React.useRef(false);
  React.useEffect(() => {
    if (applied.current || !theme) return;
    applied.current = true;
    setTheme(theme);
  }, [theme, setTheme]);

  return null;
}

/**
 * Keeps one <link> to the proxied Google stylesheet in <head> and points
 * --font-sans at the family. An empty family means the built-in Inter, which is
 * self-hosted by next/font and needs no request at all.
 */
export function FontEffect({ fontFamily }: { fontFamily?: string }) {
  React.useEffect(() => {
    const root = document.documentElement;
    const family = (fontFamily || "").trim();

    try {
      window.localStorage.setItem(FONT_STORAGE_KEY, family);
    } catch {
      /* see above */
    }

    if (!family) {
      root.style.removeProperty("--font-sans");
      document.getElementById(FONT_LINK_ID)?.remove();
      return;
    }

    let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = FONT_LINK_ID;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }

    const href = fontCssHref(family);
    if (link.href !== new URL(href, window.location.origin).href) link.href = href;

    // Quoted because family names contain spaces; the built-in stack stays as
    // the fallback so text is readable while the font is still in flight.
    root.style.setProperty("--font-sans", `"${family}"`);

    return () => {
      root.style.removeProperty("--font-sans");
    };
  }, [fontFamily]);

  return null;
}
