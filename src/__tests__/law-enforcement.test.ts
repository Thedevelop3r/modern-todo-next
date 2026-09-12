import test from "node:test";
import assert from "node:assert/strict";

import { findPage, getVariant, groupByField, statusLabel, term, variantFields } from "../lib/variants.ts";

type VariantData = Record<string, Record<string, unknown>>;

const force = getVariant("law-enforcement");

test("Law Enforcement renames the record, not the workflow", () => {
  assert.equal(term(force, "todo", "many"), "Cases");
  assert.equal(term(force, "project", "one"), "Operation");
  assert.equal(term(force, "tag", "many"), "Flags");

  assert.equal(statusLabel(force, "pending"), "Open");
  assert.equal(statusLabel(force, "progress"), "Active");
  assert.equal(statusLabel(force, "completed"), "Closed");
});

test("its fields cover what identifies and restricts a case", () => {
  const keys = variantFields(force, "todo").map((field) => field.key);
  assert.deepEqual(keys, [
    "caseNumber",
    "classification",
    "confidentiality",
    "unit",
    "badge",
    "location",
    "incidentTime",
  ]);

  const handling = variantFields(force, "todo").find((field) => field.key === "confidentiality");
  assert.equal(handling?.type, "enum");
  assert.equal(force.pdfBannerField, "confidentiality", "the banner is a field the registry points at");
});

test("Evidence is a page kind, not a page component", () => {
  assert.equal(findPage(force, "cases")?.kind, "group");
  assert.equal(findPage(force, "cases")?.groupBy, "caseNumber");
  assert.equal(findPage(force, "evidence")?.kind, "files");

  // The kind is shared machinery: nothing about it names this variant.
  assert.equal(getVariant("school").pages.every((page) => page.kind !== "files"), true);
});

test("cases group by their number, with the unnumbered pile last", () => {
  const record = (caseNumber?: string): { variantData: VariantData } => ({
    variantData: caseNumber ? { "law-enforcement": { caseNumber } } : {},
  });

  const groups = groupByField(
    [record("2026-01"), record(), record("2026-02"), record("2026-01")],
    "law-enforcement",
    "caseNumber",
    "No case number"
  );

  assert.deepEqual(
    groups.map((group) => [group.label, group.items.length]),
    [
      ["2026-01", 2],
      ["2026-02", 1],
      ["No case number", 1],
    ]
  );
});

test("every populated variant still declares a complete set of labels", () => {
  for (const variant of [force, getVariant("school"), getVariant("general")]) {
    for (const status of ["pending", "progress", "completed"] as const) {
      assert.ok(statusLabel(variant, status).length > 0, `${variant.id} is missing ${status}`);
    }
  }
});
