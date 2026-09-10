/**
 * Expands shared/themes.json into src/app/themes.css.
 *
 * A theme is only ever a different set of values for the ~32 semantic tokens
 * already declared in globals.css, so nothing else in the app has to know a
 * theme exists. Rather than hand-write 50 themes x 2 modes x 32 values, each
 * theme is a compact seed (three hues + two chroma amounts) and the ramps below
 * are the single shared definition of *where* each token sits.
 *
 * The maths is OKLCH -> sRGB. Perceptual lightness is the whole point: a fixed
 * lightness ramp reads the same across every hue, which an HSL ramp does not.
 * It runs at build time, so there is no dependency and no runtime cost.
 *
 *   npm run themes
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seeds = JSON.parse(readFileSync(join(root, "shared/themes.json"), "utf8"));

// ---------------------------------------------------------------- colour ----

/** OKLab -> linear sRGB, then gamma encode. Returns channels in 0..1. */
function oklabToLinear(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const inGamut = ([r, g, b]) => [r, g, b].every((c) => c >= -0.0001 && c <= 1.0001);

/**
 * OKLCH -> "R G B" channels, the space-separated form Tailwind needs so that
 * `bg-primary/10` can apply an alpha modifier.
 *
 * Out-of-gamut colours have their chroma reduced rather than their channels
 * clipped - clipping shifts the hue, which would make one seed drift away from
 * its neighbours in the same family.
 */
function oklch(L, C, H) {
  const rad = (H * Math.PI) / 180;
  let lo = 0;
  let hi = C;
  let linear = oklabToLinear(L, C * Math.cos(rad), C * Math.sin(rad));

  if (!inGamut(linear)) {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const test = oklabToLinear(L, mid * Math.cos(rad), mid * Math.sin(rad));
      if (inGamut(test)) lo = mid;
      else hi = mid;
    }
    linear = oklabToLinear(L, lo * Math.cos(rad), lo * Math.sin(rad));
  }

  return linear.map((c) => Math.round(Math.min(1, Math.max(0, encode(c))) * 255));
}

const format = (rgb) => rgb.join(" ");

/** WCAG relative luminance, from 0-255 sRGB channels. */
function luminance([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Near-white or near-black, whichever reads better on the given colour. */
function pickForeground(rgb, hue, chroma) {
  const light = oklch(0.99, chroma * 0.1, hue);
  const dark = oklch(0.17, chroma * 0.2, hue);
  return contrast(rgb, light) >= contrast(rgb, dark) ? light : dark;
}

/**
 * Primary carries button labels, so it has to clear 4.5:1 against *some*
 * foreground. A fixed lightness cannot do that for every hue - a mid green or
 * yellow at L 0.52 is too light for white text and too dark for black - so the
 * ramp lightness is a starting point that we walk away from until the colour
 * can hold a label. Blues and purples never move; greens and yellows darken on
 * light and brighten on dark.
 */
function readablePrimary(startL, C, H, dark) {
  const step = dark ? 0.01 : -0.01;
  const limit = dark ? 0.94 : 0.34;

  for (let L = startL; dark ? L <= limit : L >= limit; L += step) {
    const rgb = oklch(L, C, H);
    if (contrast(rgb, pickForeground(rgb, H, C)) >= 4.6) return rgb;
  }
  return oklch(limit, C, H);
}

// ----------------------------------------------------------------- ramps ----

/**
 * Meaning-bearing hues are fixed across every theme. Red/amber/green identify
 * status and priority on every badge in the app - letting a theme recolour them
 * would turn an encoding into decoration.
 */
const FIXED = { success: 148, warning: 75, danger: 27, info: 240, orange: 45 };

/** Where each token sits, per mode: [lightness, chroma scale] against the seed. */
const RAMP = {
  light: {
    bg: 0.985,
    surface: 1.0,
    "surface-raised": 1.0,
    "surface-sunken": 0.962,
    border: 0.9,
    "border-strong": 0.84,
    fg: 0.25,
    "fg-muted": 0.48,
    "fg-subtle": 0.66,
    primary: 0.52,
    accent: 0.56,
    semantic: 0.56,
    soft: 0.958,
    shadow: 0.22,
  },
  dark: {
    bg: 0.155,
    surface: 0.205,
    "surface-raised": 0.245,
    "surface-sunken": 0.125,
    border: 0.305,
    "border-strong": 0.385,
    fg: 0.955,
    "fg-muted": 0.735,
    "fg-subtle": 0.565,
    primary: 0.745,
    accent: 0.775,
    semantic: 0.785,
    soft: 0.26,
    shadow: 0,
  },
};

function buildTheme(seed, mode) {
  const r = RAMP[mode];
  const dark = mode === "dark";
  const { primary: hp, accent: ha, neutral: hn } = seed.hues;
  // Dark surfaces need more tint than light ones to read as the same theme: a
  // given chroma is far less visible against a near-black than a near-white.
  const cn = seed.chroma.neutral * (dark ? 2.4 : 1);
  const cp = seed.chroma.primary * (dark ? 0.82 : 1);

  const neutral = (L, scale = 1) => oklch(L, cn * scale, hn);
  const softC = (c) => Math.min(dark ? 0.055 : 0.045, c * (dark ? 0.4 : 0.3));
  const soft = (hue, c) => oklch(r.soft, softC(c), hue);
  const semantic = (hue) => oklch(r.semantic, dark ? 0.14 : 0.16, hue);

  const primary = readablePrimary(r.primary, cp, hp, dark);

  const t = {
    bg: neutral(r.bg),
    surface: neutral(r.surface, 0.5),
    "surface-raised": neutral(r["surface-raised"], 0.5),
    "surface-sunken": neutral(r["surface-sunken"]),
    border: neutral(r.border, 1.4),
    "border-strong": neutral(r["border-strong"], 1.6),

    fg: neutral(r.fg, 1.6),
    "fg-muted": neutral(r["fg-muted"], 1.3),
    "fg-subtle": neutral(r["fg-subtle"], 1.1),

    primary,
    "primary-fg": pickForeground(primary, hp, cp),
    "primary-soft": soft(hp, cp),

    accent: oklch(r.accent, cp * 0.92, ha),
    "accent-soft": soft(ha, cp),

    success: semantic(FIXED.success),
    "success-soft": soft(FIXED.success, 0.16),
    warning: semantic(FIXED.warning),
    "warning-soft": soft(FIXED.warning, 0.16),
    danger: semantic(FIXED.danger),
    "danger-soft": soft(FIXED.danger, 0.16),
    info: semantic(FIXED.info),
    "info-soft": soft(FIXED.info, 0.16),

    "status-pending": semantic(FIXED.danger),
    "status-progress": semantic(FIXED.warning),
    "status-completed": semantic(FIXED.success),

    "priority-none": neutral(r["fg-subtle"], 1.1),
    "priority-low": semantic(FIXED.info),
    "priority-medium": semantic(FIXED.warning),
    "priority-high": semantic(FIXED.orange),
    "priority-urgent": semantic(FIXED.danger),

    ring: primary,
    "shadow-color": dark ? [0, 0, 0] : neutral(r.shadow, 1.6),
  };

  const out = {};
  for (const [key, value] of Object.entries(t)) out[key] = format(value);

  // The escape hatch: a seed may pin any token outright, as "R G B".
  Object.assign(out, seed.overrides?.[mode] || {});
  return out;
}

// ------------------------------------------------------------- assertions ----

const parse = (s) => s.split(" ").map(Number);

/**
 * A theme that cannot be read must not ship, so a violation fails the build
 * rather than quietly emitting an unreadable palette.
 */
function assertReadable(seed, mode, t) {
  const checks = [
    ["fg on bg", t.fg, t.bg, 7],
    ["fg-muted on surface", t["fg-muted"], t.surface, 4.5],
    ["fg-subtle on surface", t["fg-subtle"], t.surface, 3],
    ["primary-fg on primary", t["primary-fg"], t.primary, 4.5],
    ["border on surface", t.border, t.surface, 1.18],
  ];

  const failures = checks
    .map(([label, a, b, min]) => ({ label, ratio: contrast(parse(a), parse(b)), min }))
    .filter((c) => c.ratio < c.min)
    .map((c) => `      ${c.label}: ${c.ratio.toFixed(2)}:1 (needs ${c.min}:1)`);

  if (failures.length) {
    return `  ${seed.id} (${mode})\n${failures.join("\n")}`;
  }
  return null;
}

// ------------------------------------------------------------------ emit ----

const ids = new Set();
const problems = [];
const blocks = [];

for (const seed of seeds) {
  if (ids.has(seed.id)) throw new Error(`Duplicate theme id: ${seed.id}`);
  ids.add(seed.id);

  for (const mode of ["light", "dark"]) {
    const tokens = buildTheme(seed, mode);
    const problem = assertReadable(seed, mode, tokens);
    if (problem) problems.push(problem);

    const selector = mode === "light" ? `[data-theme="${seed.id}"]` : `.dark[data-theme="${seed.id}"]`;
    const body = Object.entries(tokens)
      .map(([key, value]) => `  --${key}: ${value};`)
      .join("\n");

    blocks.push(`${selector} {\n${body}\n  color-scheme: ${mode};\n}`);
  }
}

if (problems.length) {
  console.error("Contrast assertions failed:\n" + problems.join("\n"));
  process.exit(1);
}

const header = `/*
 * GENERATED FILE - do not edit by hand.
 *
 * Written by scripts/generate-themes.mjs from shared/themes.json.
 * Run \`npm run themes\` after changing a seed.
 *
 * ${seeds.length} themes x light/dark. globals.css keeps its own :root/.dark
 * blocks as the fallback for when no data-theme is set.
 */
`;

writeFileSync(join(root, "src/app/themes.css"), `${header}\n${blocks.join("\n\n")}\n`);

/*
 * The catalogue is emitted as TypeScript rather than imported from the JSON
 * directly, because the app is read by three toolchains with different opinions
 * about JSON modules: webpack, the CommonJS API, and node's own test runner
 * (which needs an import attribute). A generated .ts module works in all three
 * and is typed on the way in. Only the presentation fields ship - the hues and
 * chroma are a build-time concern.
 */
const catalogue = seeds.map(({ id, name, collection, font }) => ({ id, name, collection, font }));

writeFileSync(
  join(root, "src/lib/themes.generated.ts"),
  `${header}
import type { Theme } from "./themes.ts";

export const THEME_CATALOGUE: Theme[] = ${JSON.stringify(catalogue, null, 2)};
`
);

const byCollection = seeds.reduce((acc, s) => ({ ...acc, [s.collection]: (acc[s.collection] || 0) + 1 }), {});
console.log(
  `themes.css: ${seeds.length} themes (${Object.entries(byCollection)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ")}), ${blocks.length} blocks, all contrast checks passed.`
);
