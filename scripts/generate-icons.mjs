/**
 * Generates the PWA icons from scratch - a rounded square in the app's primary
 * colour with a white tick - and writes them as PNGs.
 *
 * Run with `node scripts/generate-icons.mjs` after changing the brand colour.
 * PNG is written by hand (zlib + CRC) so this needs no image dependency.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BRAND = [79, 70, 229]; // indigo-600, the app's --primary
const WHITE = [255, 255, 255];

/** Signed distance helpers, so edges can be anti-aliased by coverage. */
const clamp01 = (value) => Math.min(1, Math.max(0, value));

function roundedSquareCoverage(x, y, size, radius) {
  const inset = size * 0.06;
  const left = inset;
  const top = inset;
  const right = size - inset;
  const bottom = size - inset;

  // Distance outside the rounded rectangle, negative inside.
  const dx = Math.max(left + radius - x, 0, x - (right - radius));
  const dy = Math.max(top + radius - y, 0, y - (bottom - radius));
  const distance = Math.hypot(dx, dy) - radius;
  return clamp01(0.5 - distance);
}

/** Coverage of a thick line segment, used for the two strokes of the tick. */
function segmentCoverage(x, y, ax, ay, bx, by, halfWidth) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = clamp01(((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby));
  const distance = Math.hypot(x - (ax + t * abx), y - (ay + t * aby));
  return clamp01(halfWidth - distance + 0.5);
}

function renderIcon(size) {
  const radius = size * 0.22;
  const stroke = size * 0.085;
  // The tick, in fractions of the canvas.
  const points = [
    [0.28, 0.52],
    [0.44, 0.68],
    [0.73, 0.35],
  ].map(([fx, fy]) => [fx * size, fy * size]);

  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      const background = roundedSquareCoverage(px, py, size, radius);
      const tick = Math.max(
        segmentCoverage(px, py, ...points[0], ...points[1], stroke / 2),
        segmentCoverage(px, py, ...points[1], ...points[2], stroke / 2)
      );

      // The tick is painted over the square, and clipped by it.
      const mark = Math.min(tick, background);
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(BRAND[channel] * (1 - mark) + WHITE[channel] * mark);
      }
      pixels[offset + 3] = Math.round(background * 255);
    }
  }

  return pixels;
}

// ---- the smallest correct PNG encoder that covers this case ----

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  // 10-12: compression, filter and interlace methods, all zero.

  // Each scanline is prefixed with its filter type; 0 means "none".
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, renderIcon(size)));
  console.log(`wrote ${file}`);
}

// The SVG twin, used for the browser tab where vectors are sharper.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="31" y="31" width="450" height="450" rx="113" fill="rgb(${BRAND.join(",")})"/>
  <path d="M143 266l82 82 149-169" fill="none" stroke="#fff" stroke-width="44"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
writeFileSync(join(OUT, "icon.svg"), svg);
console.log(`wrote ${join(OUT, "icon.svg")}`);
