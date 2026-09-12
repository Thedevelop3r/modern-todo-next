import test from "node:test";
import assert from "node:assert/strict";

import {
  findPage,
  getVariant,
  groupByField,
  scoreSummary,
  statusLabel,
  term,
  variantFields,
} from "../lib/variants.ts";

const school = getVariant("school");

/** A todo carrying School data, as the API stores it. */
const assignment = (values: Record<string, unknown>) => ({ variantData: { school: values } });

test("School renames the things a school calls by other names", () => {
  assert.equal(term(school, "todo", "one"), "Assignment");
  assert.equal(term(school, "todo", "many"), "Assignments");
  assert.equal(term(school, "project", "many"), "Courses");
  assert.equal(term(school, "tag", "many"), "Subjects");

  // Completed means submitted here, and the word matters on a due assignment.
  assert.equal(statusLabel(school, "completed"), "Submitted");
  assert.equal(statusLabel(school, "pending"), "Not started");
});

test("School declares the fields a marked assignment needs", () => {
  const keys = variantFields(school, "todo").map((field) => field.key);
  assert.deepEqual(keys, ["course", "gradeLevel", "assignmentType", "weight", "maxScore", "score", "submittedAt"]);

  const type = variantFields(school, "todo").find((field) => field.key === "assignmentType");
  assert.equal(type?.type, "enum");
  assert.ok(type?.options?.some((option) => option.value === "lab"));

  // A course carries its own details, which is what the Courses page reads.
  assert.deepEqual(
    variantFields(school, "project").map((field) => field.key),
    ["subject", "teacher", "term", "room"]
  );
});

test("both School pages are declared, and by kind rather than by component", () => {
  const courses = findPage(school, "courses");
  const gradebook = findPage(school, "gradebook");

  assert.equal(courses?.kind, "group");
  assert.equal(courses?.groupBy, "course");
  assert.equal(gradebook?.kind, "scoreboard");
  assert.equal(gradebook?.scoreField, "score");
  assert.equal(gradebook?.maxField, "maxScore");
  assert.equal(gradebook?.weightField, "weight");

  assert.equal(findPage(school, "nothing-like-this"), undefined);
  assert.equal(getVariant("general").pages.length, 0, "General adds no pages");
});

// ------------------------------------------------------------- grouping ----

test("grouping keeps first-seen order and puts the unset pile last", () => {
  const groups = groupByField(
    [
      assignment({ course: "Physics" }),
      assignment({}),
      assignment({ course: "History" }),
      assignment({ course: "Physics" }),
      assignment({ course: "" }),
    ],
    "school",
    "course",
    "No course set"
  );

  assert.deepEqual(
    groups.map((group) => [group.label, group.items.length]),
    [
      ["Physics", 2],
      ["History", 1],
      ["No course set", 2],
    ]
  );
});

test("grouping reads only the active variant's data", () => {
  const crossed = { variantData: { hospital: { course: "Ward B" }, school: { course: "Physics" } } };
  const [group] = groupByField([crossed], "school", "course");
  assert.equal(group.label, "Physics");
});

// ------------------------------------------------------------ the marks ----

const FIELDS = { scoreField: "score", maxField: "maxScore", weightField: "weight" };

test("a weighted score is weighted, and an unmarked one is not zero", () => {
  const summary = scoreSummary(
    [
      assignment({ score: 45, maxScore: 50, weight: 20 }), // 90% of 20
      assignment({ score: 30, maxScore: 60, weight: 30 }), // 50% of 30
      assignment({ maxScore: 100, weight: 50 }), // not back yet
    ],
    "school",
    FIELDS
  );

  // (0.9*20 + 0.5*30) / 50 = 66%
  assert.equal(summary.percent, 66);
  assert.equal(summary.marked, 2);
  assert.equal(summary.outstanding, 1);
  assert.equal(summary.weightMarked, 50);
  assert.equal(summary.totalWeight, 100);
});

test("nothing marked reads as no grade at all, never as zero", () => {
  const summary = scoreSummary([assignment({ maxScore: 20 }), assignment({})], "school", FIELDS);
  assert.equal(summary.percent, null, "a course with nothing back is not a fail");
  assert.equal(summary.marked, 0);
  assert.equal(summary.outstanding, 2);
});

test("unweighted work still earns an honest average", () => {
  // A course that weights nothing averages evenly rather than reporting nothing.
  const even = scoreSummary(
    [assignment({ score: 10, maxScore: 10 }), assignment({ score: 5, maxScore: 10 })],
    "school",
    FIELDS
  );
  assert.equal(even.percent, 75);
  assert.equal(even.totalWeight, 0);

  // And a half-weighted course counts the weighted ones by their weight.
  const mixed = scoreSummary(
    [assignment({ score: 10, maxScore: 10, weight: 3 }), assignment({ score: 0, maxScore: 10 })],
    "school",
    FIELDS
  );
  assert.equal(mixed.percent, 75);
});

test("a score with no maximum is not a mark", () => {
  const summary = scoreSummary(
    [assignment({ score: 42 }), assignment({ score: 5, maxScore: 0 })],
    "school",
    FIELDS
  );
  assert.equal(summary.percent, null, "42 out of nothing is not a percentage");
  assert.equal(summary.outstanding, 2);
});

test("a zero that was actually awarded counts as marked", () => {
  const summary = scoreSummary([assignment({ score: 0, maxScore: 20, weight: 10 })], "school", FIELDS);
  assert.equal(summary.percent, 0);
  assert.equal(summary.marked, 1);
});
