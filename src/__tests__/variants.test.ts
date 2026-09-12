import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_VARIANT,
  VARIANTS,
  VARIANT_IDS,
  dormantVariants,
  getVariant,
  lowerTerm,
  priorityLabel,
  resolveVariant,
  statusLabel,
  term,
  variantFields,
} from "../lib/variants.ts";

const FIELD_TYPES = ["string", "text", "number", "date", "enum", "boolean", "checklist"];

test("every variant in the registry is complete and self-consistent", () => {
  assert.ok(VARIANTS.length >= 5);
  assert.ok(VARIANT_IDS.includes(DEFAULT_VARIANT));

  for (const variant of VARIANTS) {
    assert.ok(variant.label, `${variant.id} has no label`);
    assert.ok(variant.pdfTemplate, `${variant.id} names no PDF template`);

    for (const key of ["todo", "project", "template", "tag"] as const) {
      assert.ok(variant.terms[key]?.one, `${variant.id} has no singular for ${key}`);
      assert.ok(variant.terms[key]?.many, `${variant.id} has no plural for ${key}`);
    }

    for (const status of ["pending", "progress", "completed"] as const) {
      assert.ok(variant.statusLabels[status], `${variant.id} has no label for ${status}`);
    }

    // The closed set is what keeps VariantFields a switch rather than a branch
    // on the variant id - a new type here needs a new case there.
    for (const field of [...variant.todoFields, ...variant.projectFields]) {
      assert.ok(FIELD_TYPES.includes(field.type), `${variant.id}.${field.key} has type ${field.type}`);
      assert.ok(field.key && field.label, `${variant.id} has an unnamed field`);
      if (field.type === "enum") {
        assert.ok(field.options?.length, `${variant.id}.${field.key} is an enum with no options`);
      }
    }
  }
});

test("an unknown id falls back rather than throwing", () => {
  // A preference written by a build that knew more variants must not break the app.
  assert.equal(getVariant("does-not-exist").id, DEFAULT_VARIANT);
  assert.equal(getVariant(undefined).id, DEFAULT_VARIANT);
  assert.equal(getVariant(null).id, DEFAULT_VARIANT);
});

test("a project's variant wins over the account's, and inherit means inherit", () => {
  const user = { preferences: { applicationType: "school" } };

  assert.equal(resolveVariant(user, { applicationType: "hospital" }).id, "hospital");
  assert.equal(resolveVariant(user, { applicationType: null }).id, "school");
  assert.equal(resolveVariant(user, null).id, "school");
  assert.equal(resolveVariant(null, null).id, DEFAULT_VARIANT);
});

test("terminology comes from the registry in both cases and counts", () => {
  const general = getVariant("general");

  assert.equal(term(general, "todo", "one"), "Todo");
  assert.equal(term(general, "todo", "many"), "Todos");
  assert.equal(lowerTerm(general, "project", "many"), "projects");
  // Default count is the singular.
  assert.equal(term(general, "tag"), general.terms.tag.one);
});

test("status and priority labels resolve for every value", () => {
  for (const variant of VARIANTS) {
    for (const status of ["pending", "progress", "completed"] as const) {
      assert.ok(statusLabel(variant, status).length > 0);
    }
    for (const priority of ["none", "low", "medium", "high", "urgent"] as const) {
      assert.ok(priorityLabel(variant, priority).length > 0);
    }
  }
});

test("General adds no fields, so existing accounts see no change", () => {
  const general = getVariant("general");
  assert.deepEqual(variantFields(general, "todo"), []);
  assert.deepEqual(variantFields(general, "project"), []);
});

test("dormant variants are the ones carrying data that is not in force", () => {
  const data = {
    general: {},
    school: { course: "Physics" },
    hospital: { ward: "B4" },
  };

  const dormant = dormantVariants(data, "school");
  assert.deepEqual(
    dormant.map((entry) => entry.variant.id),
    ["hospital"],
    "the active variant and empty ones are not dormant"
  );
  assert.deepEqual(dormant[0].values, { ward: "B4" });

  assert.deepEqual(dormantVariants(undefined, "general"), []);
  assert.deepEqual(dormantVariants({ general: { a: 1 } }, "general"), []);
});
