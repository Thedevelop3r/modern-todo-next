import test from "node:test";
import assert from "node:assert/strict";

import { belowPar, findPage, getVariant, statusLabel, term, variantFields, VARIANTS } from "../lib/variants.ts";

type VariantData = Record<string, Record<string, unknown>>;

const restaurant = getVariant("restaurant");
const line = (values: Record<string, unknown>, title = "item"): { title: string; variantData: VariantData } => ({
  title,
  variantData: { restaurant: values },
});

test("Restaurant speaks a kitchen's language", () => {
  assert.equal(term(restaurant, "todo", "many"), "Prep");
  assert.equal(term(restaurant, "project", "many"), "Stations");
  assert.equal(term(restaurant, "template", "many"), "Recipes");
  assert.equal(statusLabel(restaurant, "pending"), "To prep");
  assert.equal(statusLabel(restaurant, "completed"), "Ready");
});

test("allergens are a checklist, so they are ticked rather than typed", () => {
  const allergens = variantFields(restaurant, "todo").find((field) => field.key === "allergens");
  assert.equal(allergens?.type, "checklist");
});

test("its three pages use three kinds, two of them already built", () => {
  assert.equal(findPage(restaurant, "stations")?.kind, "group");
  assert.equal(findPage(restaurant, "prep-list")?.kind, "group");

  const orders = findPage(restaurant, "orders");
  assert.equal(orders?.kind, "stock");
  assert.equal(orders?.groupBy, "supplier");
  assert.equal(orders?.parField, "parLevel");
  assert.equal(orders?.onHandField, "onHand");
});

test("below par is worst first, and only what is actually short", () => {
  const lines = belowPar(
    [
      line({ parLevel: 6, onHand: 4 }, "shallots"),
      line({ parLevel: 20, onHand: 4 }, "stock"),
      line({ parLevel: 5, onHand: 9 }, "butter"),
      line({ parLevel: 5, onHand: 5 }, "exactly at par"),
    ],
    "restaurant",
    { parField: "parLevel", onHandField: "onHand" }
  );

  assert.deepEqual(
    lines.map((entry) => [entry.record.title, entry.shortfall]),
    [
      ["stock", 16],
      ["shallots", 2],
    ]
  );
});

test("no par level is not stock; no count is nothing on hand", () => {
  const lines = belowPar(
    [line({ onHand: 0 }, "an ordinary task"), line({ parLevel: 10 }, "veal jus"), line({ parLevel: 0, onHand: 0 }, "zero par")],
    "restaurant",
    { parField: "parLevel", onHandField: "onHand" }
  );

  assert.deepEqual(
    lines.map((entry) => [entry.record.title, entry.onHand, entry.shortfall]),
    [["veal jus", 0, 10]],
    "a task with no par must not appear on an order sheet"
  );
});

test("all five variants are populated, and every page kind is one we render", () => {
  const KINDS = ["group", "scoreboard", "files", "stock"];

  assert.equal(VARIANTS.length, 5);
  for (const variant of VARIANTS) {
    assert.ok(variant.label && variant.pdfTemplate);
    for (const page of variant.pages) {
      assert.ok(KINDS.includes(page.kind), `${variant.id}.${page.id} has kind ${page.kind}`);
    }
    // Every elevated or bannered key must be a field the variant declares.
    const keys = variantFields(variant, "todo").map((field) => field.key);
    for (const key of variant.pdfHighlights) assert.ok(keys.includes(key), `${variant.id} elevates ${key}`);
    if (variant.pdfBannerField) assert.ok(keys.includes(variant.pdfBannerField));
  }
});
