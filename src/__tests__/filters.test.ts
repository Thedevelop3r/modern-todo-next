import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_FILTER, parseFilter, serializeFilter } from "../lib/filters.ts";

test("only non-default values are written to the URL", () => {
  assert.equal(serializeFilter(DEFAULT_FILTER).toString(), "");

  const params = serializeFilter({ ...DEFAULT_FILTER, q: "rent", due: "overdue", page: 3 });
  assert.equal(params.get("q"), "rent");
  assert.equal(params.get("due"), "overdue");
  assert.equal(params.get("page"), "3");
  assert.equal(params.get("sort"), null);
});

test("a filter survives a round trip through the query string", () => {
  const filter: TodoFilter = {
    ...DEFAULT_FILTER,
    q: "report",
    status: ["pending", "progress"],
    priority: ["high"],
    tags: ["work", "urgent"],
    due: "week",
    projectId: "64b7f0c2c2a4f1a2b3c4d5e6",
    blocked: true,
    sort: "dueDate",
    order: "asc",
    page: 2,
    limit: 20,
  };

  const round = parseFilter(new URLSearchParams(serializeFilter(filter).toString()));
  assert.deepEqual(round, filter);
});

test("an empty query string is the default filter", () => {
  const parsed = parseFilter(new URLSearchParams(""));

  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 10);
  assert.equal(parsed.due, "any");
  assert.deepEqual(parsed.status, []);
  assert.equal(parsed.blocked, undefined);
});

test("the page size falls back to the user's preference", () => {
  assert.equal(parseFilter(new URLSearchParams(""), 50).limit, 50);
  // An explicit value in the URL still wins.
  assert.equal(parseFilter(new URLSearchParams("limit=5"), 50).limit, 5);
});
