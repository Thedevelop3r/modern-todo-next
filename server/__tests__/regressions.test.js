/**
 * One test per bug found in the 2.1.0 review.
 *
 * These are deliberately grouped rather than spread through the suites they
 * touch: each one describes a specific way the application used to be wrong, so
 * a failure here names the regression directly instead of a feature.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { connect, disconnect, reset, makeApp, makeUser, createTodo } = require("./helpers");
const { Todo } = require("../models");
const { toCsv, parseCsv } = require("../utils/csv");
const { resolveRichText } = require("../utils/sanitize");
const { endsWithPdfTrailer } = require("../services/compression");
const { jobRegistry } = require("../services/job-registry");

let app;

test.before(async () => {
  await connect();
  app = makeApp();
});
test.beforeEach(reset);
test.after(disconnect);

// ------------------------------------------------------- data integrity ----

test("bulk actions cannot write a value outside the schema enums", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "enum guard" });

  // Used to answer 200 and store the string verbatim, because updateMany does
  // not run validators - which then crashed the board, since it indexes a
  // fixed map by status.
  await agent
    .patch("/api/todo/bulk")
    .send({ ids: [todo._id], action: "status", value: "totally-not-a-status" })
    .expect(400);

  await agent
    .patch("/api/todo/bulk")
    .send({ ids: [todo._id], action: "priority", value: "SUPER" })
    .expect(400);

  const after = await agent.get(`/api/todo/${todo._id}`).expect(200);
  assert.equal(after.body.status, "pending");
  assert.equal(after.body.priority, "none");

  // The legitimate values still work.
  await agent
    .patch("/api/todo/bulk")
    .send({ ids: [todo._id], action: "status", value: "completed" })
    .expect(200);
  const done = await agent.get(`/api/todo/${todo._id}`).expect(200);
  assert.equal(done.body.status, "completed");
});

test("a todo cannot be filed under another account's project", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);

  const project = await bob.agent.post("/api/project").send({ name: "Bob's project" }).expect(201);
  const foreignId = project.body._id;

  // On create: used to answer 201 and persist the cross-owner reference.
  await alice.agent.post("/api/todo").send({ title: "cross", projectId: foreignId }).expect(400);

  // And through the bulk endpoint, which never checked at all.
  const todo = await createTodo(alice.agent, { title: "mine" });
  await alice.agent
    .patch("/api/todo/bulk")
    .send({ ids: [todo._id], action: "project", value: foreignId })
    .expect(400);

  const after = await alice.agent.get(`/api/todo/${todo._id}`).expect(200);
  assert.equal(after.body.projectId, null);

  // Clearing the project is still a valid bulk action.
  await alice.agent
    .patch("/api/todo/bulk")
    .send({ ids: [todo._id], action: "project", value: null })
    .expect(200);
});

test("an import flag sent as the string \"false\" is false", async () => {
  const { agent } = await makeUser(app);
  const data = JSON.stringify({ todos: [{ title: "imported by string flag" }] });

  // z.coerce.boolean() made "false" true, so this silently previewed instead of
  // importing and answered 200 as though it had worked.
  const res = await agent
    .post("/api/account/import")
    .send({ format: "json", data, dryRun: "false" })
    .expect(200);

  assert.equal(res.body.dryRun, false);
  assert.equal(res.body.created, 1);
  assert.equal(await Todo.countDocuments({ ownerId: null }), 0);

  const list = await agent.get("/api/todo").expect(200);
  assert.equal(list.body.data.length, 1);
});

test("rich text is capped before sanitising, so stored markup is never cut mid-tag", () => {
  // Sanitising *grows* an anchor (rel and target are added), so a document just
  // inside the limit could exceed it and be sliced through an attribute.
  const link = '<p><a href="https://example.com">x</a></p>';
  const html = link.repeat(400);

  const { html: clean } = resolveRichText({ html, maxHtml: 2000, maxText: 2000 });

  assert.ok(clean.length <= 2000);
  // No dangling "<a href=..." left behind by the cut.
  assert.equal(clean.split("<a ").length - 1, clean.split("</a>").length - 1);
  assert.ok(!/<[a-z-]*$|<a[^>]*$/i.test(clean), `markup ends mid-tag: ${clean.slice(-60)}`);
});

// --------------------------------------------------------------- files ----

test("a truncated PDF is not mistaken for a well-compressed one", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-trailer-"));

  const whole = path.join(dir, "whole.pdf");
  fs.writeFileSync(whole, `%PDF-1.7\n${"A".repeat(4096)}\n%%EOF\n`);

  const cut = path.join(dir, "cut.pdf");
  fs.writeFileSync(cut, `%PDF-1.7\n${"A".repeat(4096)}`);

  const empty = path.join(dir, "empty.pdf");
  fs.writeFileSync(empty, "");

  // The check that separates "compressed hard" from "cut off part way through",
  // which byte size alone cannot do.
  assert.equal(await endsWithPdfTrailer(whole), true);
  assert.equal(await endsWithPdfTrailer(cut), false);
  assert.equal(await endsWithPdfTrailer(empty), false);
  assert.equal(await endsWithPdfTrailer(path.join(dir, "missing.pdf")), false);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("a job id already in flight is not reused", async () => {
  const live = "11111111-1111-4111-8111-111111111111";
  jobRegistry.start({ jobId: live, ownerId: "someone", filename: "x", totalBytes: 1, compress: false });

  try {
    // Taking the supplied id here would replace the live job's registry entry,
    // losing the child-process handle used to kill it on shutdown.
    assert.ok(jobRegistry.get(live));
    assert.equal(jobRegistry.subscriberCount("someone"), 0);
  } finally {
    jobRegistry.finish(live, { state: "failed" });
  }
});

// ----------------------------------------------------------------- csv ----

test("a CSV cell cannot smuggle a spreadsheet formula, and still round-trips", () => {
  const rows = [
    { title: '=HYPERLINK("http://evil","Click")' },
    { title: "-urgent thing" },
    { title: "+1 more" },
    { title: "@mention, with a comma" },
    { title: "an ordinary title" },
  ];

  const csv = toCsv(rows, [{ key: "title", header: "title" }]);

  // No cell begins with a character a spreadsheet would execute.
  csv
    .split("\r\n")
    .slice(1)
    .forEach((line) => assert.ok(!/^"?[=+\-@]/.test(line), `formula reached the file: ${line}`));

  // And our own importer strips the guard back off, so an export survives the
  // trip through it unchanged.
  const back = parseCsv(csv);
  rows.forEach((row, index) => assert.equal(back[index].title, row.title));
});
