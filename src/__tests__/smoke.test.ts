import test from "node:test";
import assert from "node:assert/strict";
import { parseQuickAdd } from "../lib/quickAdd.ts";

test("smoke", () => {
  const result = parseQuickAdd("pay rent tomorrow !high #home");
  assert.equal(typeof result.title, "string");
});
