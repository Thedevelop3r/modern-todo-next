// Font.controller.js

const crypto = require("node:crypto");
const { ApiError } = require("../utils/api-error");
const FAMILIES = require("../../shared/google-fonts.json");

/**
 * Google Fonts, proxied.
 *
 * The app's CSP is `font-src 'self' data:` and `style-src 'self'` (see
 * next.config.js), so the browser cannot talk to fonts.googleapis.com or
 * fonts.gstatic.com at all. Rather than widen the policy, the server fetches
 * both the stylesheet and the woff2 files and re-serves them from our own
 * origin. Three things fall out of that:
 *
 *   - the CSP stays locked shut,
 *   - public/sw.js already caches same-origin GETs, so a chosen font keeps
 *     working offline,
 *   - no user's browser ever makes a request to Google.
 *
 * Google's css2 endpoint content-negotiates on User-Agent; the string below is
 * what makes it return woff2 rather than a legacy format.
 */
const GOOGLE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const ALLOWED_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/** Families are letters, digits and spaces - anything else is not a font name. */
const FAMILY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$/;

const WEIGHTS = "wght@400;500;600;700";

/**
 * Bounded caches. Fonts are small and a single user picks very few, so a plain
 * Map with an oldest-out cap is the right size of solution - the browser holds
 * the real cache for a year via Cache-Control.
 */
const CSS_CACHE = new Map();
const FILE_CACHE = new Map();
/** id -> gstatic URL, populated only by parsing a stylesheet Google sent us. */
const FILE_URLS = new Map();
const CACHE_MAX = 200;

function remember(cache, key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

/** Guards every outbound fetch, so a bug upstream cannot become an SSRF. */
async function fetchGoogle(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw ApiError.badRequest("Not a Google Fonts URL");
  }
  return fetch(parsed, { headers: { "User-Agent": GOOGLE_UA } });
}

const FontController = {
  /**
   * Typeahead over the committed family list. Filtering happens here rather
   * than in the browser so the ~90KB name list never enters the client bundle.
   */
  search(query, limit = 10) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];

    const starts = [];
    const contains = [];
    for (const font of FAMILIES) {
      const name = font.family.toLowerCase();
      if (name.startsWith(q)) starts.push(font);
      else if (name.includes(q)) contains.push(font);
      if (starts.length >= limit) break;
    }
    return [...starts, ...contains].slice(0, limit);
  },

  /**
   * The stylesheet for one family, with every gstatic URL rewritten to a local
   * one. Doubles as the existence check behind the free-text font field: if
   * Google does not know the family, this is the 400 the user sees.
   */
  async css(family) {
    const name = String(family || "").trim();
    if (!FAMILY_PATTERN.test(name)) throw ApiError.badRequest("That is not a valid font name");

    const cached = CSS_CACHE.get(name);
    if (cached) return cached;

    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(
      /%20/g,
      "+"
    )}:${WEIGHTS}&display=swap`;

    let response;
    try {
      response = await fetchGoogle(url);
    } catch {
      throw new ApiError(502, "Could not reach Google Fonts. Try again in a moment.");
    }

    if (response.status === 400 || response.status === 404) {
      throw ApiError.badRequest(`Google Fonts has no family called "${name}"`);
    }
    if (!response.ok) throw new ApiError(502, "Google Fonts returned an error");

    const source = await response.text();

    // Every url(...) Google gave us is registered under an opaque id. The file
    // endpoint can then only serve URLs that arrived this way - there is no
    // user-supplied URL anywhere in the chain.
    const css = source.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g, (match, fileUrl) => {
      const id = crypto.createHash("sha256").update(fileUrl).digest("hex").slice(0, 32);
      remember(FILE_URLS, id, fileUrl);
      return `url(/api/fonts/file/${id})`;
    });

    return remember(CSS_CACHE, name, css);
  },

  /** One font file, by the id handed out above. */
  async file(id) {
    if (!/^[a-f0-9]{32}$/.test(String(id || ""))) throw ApiError.notFound("Unknown font file");

    const cached = FILE_CACHE.get(id);
    if (cached) return cached;

    const url = FILE_URLS.get(id);
    // An id we never issued, or one evicted from the cache. Re-requesting the
    // stylesheet re-registers it, so the client just needs to retry.
    if (!url) throw ApiError.notFound("Unknown font file");

    const response = await fetchGoogle(url);
    if (!response.ok) throw new ApiError(502, "Could not fetch that font file");

    const body = Buffer.from(await response.arrayBuffer());
    return remember(FILE_CACHE, id, {
      body,
      contentType: response.headers.get("content-type") || "font/woff2",
    });
  },

  /** Exposed for the tests, which must not inherit another test's cache. */
  clearCache() {
    CSS_CACHE.clear();
    FILE_CACHE.clear();
    FILE_URLS.clear();
  },
};

module.exports = { FontController };
