/**
 * Frontend tests run on node's own test runner: node 24 strips the types, so
 * there is no build step and no test framework to keep up to date. Only pure
 * modules are covered - anything that needs a DOM is out of scope.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { parseQuickAdd } from "../lib/quickAdd.ts";

test("pulls tags, project, priority and estimate out of one line", () => {
  const result = parseQuickAdd('Pay rent !high #home #bills @"Personal admin" ~3');

  assert.equal(result.title, "Pay rent");
  assert.equal(result.priority, "high");
  assert.deepEqual(result.tags, ["home", "bills"]);
  assert.equal(result.projectName, "Personal admin");
  assert.equal(result.estimate, 3);
});

test("leaves tokens it does not understand in the title", () => {
  const result = parseQuickAdd("Email bob@example.com about !urgentish #x");

  assert.equal(result.priority, null);
  assert.deepEqual(result.tags, ["x"]);
  assert.match(result.title, /!urgentish/);
  assert.match(result.title, /bob@example\.com/);
});

test("a duplicate tag is only recorded once", () => {
  const result = parseQuickAdd("Tidy up #home #HOME #home");
  assert.deepEqual(result.tags, ["home"]);
});

test("understands a relative due date and reports what it matched", () => {
  const result = parseQuickAdd("Call the dentist tomorrow");

  assert.equal(result.title, "Call the dentist");
  assert.ok(result.dueDate);

  const due = new Date(result.dueDate as string);
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  assert.ok(days >= 0 && days <= 1, `expected tomorrow, got ${due.toISOString()}`);
  assert.ok(result.matched.some((entry) => entry.kind === "due"));
});

test("a bare line stays a bare title", () => {
  const result = parseQuickAdd("Buy milk");

  assert.equal(result.title, "Buy milk");
  assert.equal(result.dueDate, null);
  assert.equal(result.priority, null);
  assert.deepEqual(result.tags, []);
  assert.equal(result.matched.length, 0);
});
