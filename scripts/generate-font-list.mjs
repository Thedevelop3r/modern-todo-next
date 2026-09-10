/**
 * Writes shared/google-fonts.json - every Google Fonts family name and its
 * category, used by the /api/fonts/search typeahead.
 *
 * The list is committed so the running app needs no Google API key and no
 * network call to offer suggestions; only the fonts a user actually picks are
 * fetched at runtime (see server/controller/Font.controller.js).
 *
 * Source is fonts.google.com/metadata/fonts, which is public and unkeyed.
 * Google adds families regularly, so re-run this occasionally - but a stale list
 * only costs a missing suggestion: the settings field accepts free text and
 * validates any name against Google directly.
 *
 *   npm run fonts
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://fonts.google.com/metadata/fonts";

const response = await fetch(SOURCE);
if (!response.ok) {
  console.error(`${SOURCE} returned ${response.status}. The list was left unchanged.`);
  process.exit(1);
}

// The endpoint guards its JSON with an anti-hijacking prefix.
const body = (await response.text()).replace(/^[^[{]*/, "");
const { familyMetadataList } = JSON.parse(body);

const families = familyMetadataList
  .map(({ family, category }) => ({ family, category }))
  .sort((a, b) => a.family.localeCompare(b.family));

writeFileSync(join(root, "shared/google-fonts.json"), `${JSON.stringify(families)}\n`);
console.log(`google-fonts.json: ${families.length} families.`);
