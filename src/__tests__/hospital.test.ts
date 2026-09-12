import test from "node:test";
import assert from "node:assert/strict";

import { findPage, getVariant, priorityLabel, statusLabel, term, variantFields } from "../lib/variants.ts";

const hospital = getVariant("hospital");

test("Hospital speaks a ward's language", () => {
  assert.equal(term(hospital, "project", "many"), "Wards");
  assert.equal(term(hospital, "template", "many"), "Protocols");
  assert.equal(statusLabel(hospital, "pending"), "To do");
  assert.equal(priorityLabel(hospital, "urgent"), "Immediate");
});

test("its standing notice is registry data, so no page can forget it", () => {
  assert.ok(hospital.notice);
  assert.match(hospital.notice!.body, /not an EHR/i);
  assert.match(hospital.notice!.body, /reads are not audited/i);

  // Only the variant that needs one declares one.
  assert.equal(getVariant("general").notice, undefined);
  assert.equal(getVariant("law-enforcement").notice, undefined);
});

test("there is a patient reference and nowhere to put a name", () => {
  const keys = variantFields(hospital, "todo").map((field) => field.key);
  assert.ok(keys.includes("patientRef"));
  assert.ok(!keys.some((key) => /name|dob|diagnos/i.test(key)));
});

test("both ward pages are ordinary group pages", () => {
  assert.equal(findPage(hospital, "wards")?.kind, "group");
  assert.equal(findPage(hospital, "wards")?.groupBy, "ward");
  // The handover sheet is the same kind pointed at a different field - which is
  // the whole point of declaring pages by kind.
  assert.equal(findPage(hospital, "handover")?.kind, "group");
  assert.equal(findPage(hospital, "handover")?.groupBy, "dueWindow");
});
