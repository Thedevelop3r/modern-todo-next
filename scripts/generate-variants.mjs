/*
 * generate-variants.mjs - shared/variants/*.json into one typed TS module.
 *
 * The same arrangement as the themes: the registry is JSON so both runtimes
 * read one source, and the browser side gets a plain TS module rather than a
 * JSON import. That is not ceremony - src/lib/variants.ts is covered by
 * `npm run test:web`, which runs on node's type stripping with no bundler, and
 * a JSON import would not resolve there.
 *
 * Run `npm run variants` after editing a variant file.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

const index = read("shared/variants/index.json");
const variants = index.variants.map((id) => {
  const variant = read(`shared/variants/${id}.json`);
  if (variant.id !== id) throw new Error(`${id}.json declares id "${variant.id}"`);
  return variant;
});

const header = `/*
 * GENERATED FILE - do not edit by hand.
 *
 * Written by scripts/generate-variants.mjs from shared/variants/*.json, which
 * server/config/variants.js reads directly. Run \`npm run variants\` after
 * editing a variant.
 */`;

writeFileSync(
  join(root, "src/lib/variants.generated.ts"),
  `${header}

import type { Variant } from "./variants.ts";

export const DEFAULT_VARIANT_ID = ${JSON.stringify(index.default)};

export const VARIANT_CATALOGUE: Variant[] = ${JSON.stringify(variants, null, 2)};
`
);

const fields = variants.reduce((total, v) => total + v.todoFields.length + v.projectFields.length, 0);
console.log(`variants.generated.ts: ${variants.length} variants, ${fields} extra fields.`);
