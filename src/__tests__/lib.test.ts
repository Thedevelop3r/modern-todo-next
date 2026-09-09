import test from "node:test";
import assert from "node:assert/strict";

import { cn, initials, subtaskProgress, splitHighlight, formatDuration, liveMinutes } from "../lib/utils.ts";
import { dueState, dueLabel, toDate } from "../lib/date.ts";
import { passwordStrength, todoSchema, preferencesSchema, deleteAccountSchema } from "../lib/validation.ts";

// ------------------------------------------------------------- utils ----

test("cn lets the later Tailwind utility win", () => {
  assert.equal(cn("px-2", "px-4"), "px-4");
  assert.equal(cn("text-sm", false && "hidden", "font-bold"), "text-sm font-bold");
});

test("initials cope with one name, two names and nothing", () => {
  assert.equal(initials("Bilal Amjad"), "BA");
  assert.equal(initials("Prince"), "P");
  assert.equal(initials(), "?");
});

test("subtask progress is null when there is nothing to track", () => {
  assert.equal(subtaskProgress([]), null);
  assert.equal(subtaskProgress(undefined), null);

  const progress = subtaskProgress([
    { title: "a", done: true },
    { title: "b", done: false },
    { title: "c", done: true },
  ]);
  assert.deepEqual(progress, { done: 2, total: 3, percent: 67 });
});

test("highlighting splits on the query, case-insensitively", () => {
  const parts = splitHighlight("Pay the rent", "RENT");
  assert.deepEqual(
    parts.map((part) => part.match),
    [false, true]
  );
  assert.equal(splitHighlight("Pay the rent", "").length, 1);
});

test("durations read as hours and minutes", () => {
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(90), "1h 30m");
  assert.equal(formatDuration(120), "2h");
});

test("a running timer adds its elapsed minutes to the banked total", () => {
  const startedFiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(liveMinutes({ title: "x", timeSpent: 10 } as Todo), 10);
  assert.equal(liveMinutes({ title: "x", timeSpent: 10, timerStartedAt: startedFiveMinutesAgo } as Todo), 15);
});

// -------------------------------------------------------------- date ----

const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

test("due state separates overdue, today, soon and later", () => {
  assert.equal(dueState({ title: "x" } as Todo), "none");
  assert.equal(dueState({ title: "x", dueDate: inDays(-1) } as Todo), "overdue");
  assert.equal(dueState({ title: "x", dueDate: inDays(0) } as Todo), "today");
  assert.equal(dueState({ title: "x", dueDate: inDays(2) } as Todo), "soon");
  assert.equal(dueState({ title: "x", dueDate: inDays(30) } as Todo), "later");
  // A finished todo is never overdue, whatever its date says.
  assert.equal(dueState({ title: "x", dueDate: inDays(-9), status: "completed" } as Todo), "done");
});

test("due labels are written the way a person would say them", () => {
  assert.equal(dueLabel({ title: "x", dueDate: inDays(0) } as Todo), "Due today");
  assert.equal(dueLabel({ title: "x", dueDate: inDays(1) } as Todo), "Due tomorrow");
  assert.equal(dueLabel({ title: "x", dueDate: inDays(-1) } as Todo), "1 day overdue");
  assert.equal(dueLabel({ title: "x", dueDate: inDays(-3) } as Todo), "3 days overdue");
  assert.equal(dueLabel({ title: "x" } as Todo), "");
});

test("toDate refuses rubbish rather than returning an Invalid Date", () => {
  assert.equal(toDate("not a date"), null);
  assert.equal(toDate(null), null);
  assert.ok(toDate("2030-01-01T00:00:00.000Z") instanceof Date);
});

// -------------------------------------------------- validation mirror ----

test("the todo schema agrees with the API's limits", () => {
  assert.equal(todoSchema.safeParse({ title: "" }).success, false);
  assert.equal(todoSchema.safeParse({ title: "x".repeat(101) }).success, false);
  assert.equal(todoSchema.safeParse({ title: "Fine", priority: "nope" }).success, false);
  assert.equal(todoSchema.safeParse({ title: "Fine" }).success, true);
});

test("preferences reject a scale the server would not store", () => {
  assert.equal(preferencesSchema.safeParse({ uiScale: "large" }).success, true);
  assert.equal(preferencesSchema.safeParse({ uiScale: "enormous" }).success, false);
  assert.equal(preferencesSchema.safeParse({ pageSize: 1 }).success, false);
});

test("deleting an account needs the literal word", () => {
  assert.equal(deleteAccountSchema.safeParse({ password: "x", confirm: "delete" }).success, false);
  assert.equal(deleteAccountSchema.safeParse({ password: "x", confirm: "DELETE" }).success, true);
});

test("password strength grows with length and variety", () => {
  const weak = passwordStrength("abc");
  const strong = passwordStrength("Str0ng-and-long-passphrase!");

  assert.ok(strong.score > weak.score);
  assert.ok(strong.label.length > 0);
  assert.ok(weak.hint.length > 0);
});
