const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser, createTodo } = require("./helpers");
const { GeneratedPdf, StoredFile, Todo } = require("../models");
const { pdfFilename, slug, PdfController } = require("../controller/Pdf.controller");
const { binaryPath } = require("../services/pdf-service");
const pdfClient = require("../services/pdf.client");

let app;

/** A minimal but structurally valid PDF, so no renderer is needed to test around one. */
const FAKE_PDF = Buffer.from(`%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);

const realRender = pdfClient.render;

/** Swap the renderer for one that answers instantly, for the tests that are not about it. */
function stubRender(handler = async () => FAKE_PDF) {
  pdfClient.render = handler;
}

test.before(async () => {
  await connect();
  app = makeApp();
});

test.after(async () => {
  pdfClient.render = realRender;
  await disconnect();
});

test.beforeEach(async () => {
  await reset();
  stubRender();
});

/** POST is 202: the version lands a moment later, over the events stream. */
async function waitForVersions(agent, path, count) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await agent.get(path).expect(200);
    if (response.body.length >= count) return response.body;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`only ever saw fewer than ${count} versions at ${path}`);
}

// ------------------------------------------------------------ filenames ----

test("a filename sorts, self-identifies and stays unambiguous across versions", () => {
  const name = pdfFilename({
    kind: "todo",
    id: "651f3a9c0000000000ef6f3a1b",
    version: 3,
    at: new Date("2026-09-12T14:30:00Z"),
    title: "Quarterly Safety Review",
  });

  assert.equal(name, "TODO-6f3a1b-v03-20260912-1430-quarterly-safety-review.pdf");
  // Zero-padded, so v3 and v12 sort in the order a human expects.
  assert.match(pdfFilename({ kind: "project", id: "abcdef123456", version: 12, at: new Date(), title: "x" }), /^PROJ-123456-v12-/);
});

test("a title slug is ascii, hyphenated and capped", () => {
  assert.equal(slug("Ünit #3: déjà vu!"), "unit-3-deja-vu");
  assert.equal(slug(""), "untitled");
  assert.ok(slug("a".repeat(80)).length <= 40);
});

// ------------------------------------------------------------ versioning ----

test("generating produces a version, a stored file and a quota charge", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Ship it", descriptionHtml: "<p>Body</p>" });

  const before = await agent.get("/api/files/quota").expect(200);

  const started = await agent.post(`/api/todo/${todo._id}/pdfs`).expect(202);
  assert.match(started.body.jobId, /^[0-9a-f-]{36}$/);
  assert.equal(started.body.version, 1);

  const [version] = await waitForVersions(agent, `/api/todo/${todo._id}/pdfs`, 1);
  assert.equal(version.version, 1);
  assert.equal(version.sizeBytes, FAKE_PDF.length);
  assert.match(version.filename, /^TODO-[0-9a-f]{6}-v01-\d{8}-\d{4}-ship-it\.pdf$/);
  assert.equal(version.generatedBy.name, (await agent.get("/api/user/me")).body.name);
  assert.equal(version.current, true, "a version of an unchanged todo is up to date");

  const stored = await StoredFile.findById(version.fileId);
  assert.equal(stored.source, "generated");
  assert.equal(stored.kind, "pdf");
  assert.equal(stored.state, "ready");
  assert.equal(stored.scope.kind, "todo");

  const after = await agent.get("/api/files/quota").expect(200);
  assert.equal(after.body.usedBytes - before.body.usedBytes, FAKE_PDF.length);
});

test("editing the todo makes the existing version stop claiming to be current", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Before" });

  await agent.post(`/api/todo/${todo._id}/pdfs`).expect(202);
  const [first] = await waitForVersions(agent, `/api/todo/${todo._id}/pdfs`, 1);
  assert.equal(first.current, true);

  await agent.put(`/api/todo/${todo._id}`).send({ title: "After" }).expect(200);

  const [stale] = await agent.get(`/api/todo/${todo._id}/pdfs`).expect(200).then((r) => r.body);
  assert.equal(stale.current, false);
  // The old version still says what it was made from.
  assert.equal(stale.snapshotTitle, "Before");
});

test("two renders at once get different version numbers", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Race" });

  const userId = (await Todo.findById(todo._id)).ownerId;
  const results = await Promise.all(
    [1, 2, 3].map((n) =>
      PdfController.generate({ kind: "todo", refId: todo._id, userId, user: { name: "T" }, jobId: `job-${n}` })
    )
  );

  const versions = results.map((record) => record.version).sort();
  assert.deepEqual(versions, [1, 2, 3], "counting rows instead of $inc would repeat a number");
});

test("a deleted version frees its bytes and never has its number reused", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Keep" });

  await agent.post(`/api/todo/${todo._id}/pdfs`).expect(202);
  const [v1] = await waitForVersions(agent, `/api/todo/${todo._id}/pdfs`, 1);

  const used = (await agent.get("/api/files/quota")).body.usedBytes;

  const deleted = await agent.delete(`/api/todo/${todo._id}/pdfs/${v1._id}`).expect(200);
  assert.equal(deleted.body.deleted, true);
  assert.equal(deleted.body.freedBytes, FAKE_PDF.length);

  assert.equal((await agent.get("/api/files/quota")).body.usedBytes, used - FAKE_PDF.length);
  assert.equal(await StoredFile.countDocuments({ _id: v1.fileId }), 0, "the bytes go with the row");
  assert.deepEqual((await agent.get(`/api/todo/${todo._id}/pdfs`)).body, []);

  await agent.post(`/api/todo/${todo._id}/pdfs`).expect(202);
  const [next] = await waitForVersions(agent, `/api/todo/${todo._id}/pdfs`, 1);
  assert.equal(next.version, 2, "v1 is gone but stays taken - a downloaded file is never ambiguous");
});

test("downloading a version streams the pdf, and only to its owner", async () => {
  const { agent } = await makeUser(app);
  const { agent: stranger } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Private" });

  await agent.post(`/api/todo/${todo._id}/pdfs`).expect(202);
  const [version] = await waitForVersions(agent, `/api/todo/${todo._id}/pdfs`, 1);

  const download = await agent.get(`/api/todo/${todo._id}/pdfs/${version._id}?download=1`).expect(200);
  assert.equal(download.headers["content-type"], "application/pdf");
  assert.match(download.headers["content-disposition"], /^attachment;/);
  assert.equal(download.body.subarray(0, 5).toString(), "%PDF-");

  // The preview needs it inline; the same bytes, a different disposition.
  const inline = await agent.get(`/api/todo/${todo._id}/pdfs/${version._id}`).expect(200);
  assert.match(inline.headers["content-disposition"], /^inline;/);

  await stranger.get(`/api/todo/${todo._id}/pdfs/${version._id}`).expect(404);
  await stranger.delete(`/api/todo/${todo._id}/pdfs/${version._id}`).expect(404);
  await stranger.get(`/api/todo/${todo._id}/pdfs`).expect(404);
});

test("a version id cannot be borrowed across subjects", async () => {
  const { agent } = await makeUser(app);
  const one = await createTodo(agent, { title: "One" });
  const two = await createTodo(agent, { title: "Two" });

  await agent.post(`/api/todo/${one._id}/pdfs`).expect(202);
  const [version] = await waitForVersions(agent, `/api/todo/${one._id}/pdfs`, 1);

  await agent.get(`/api/todo/${two._id}/pdfs/${version._id}`).expect(404);
});

test("deleting the subject takes its versions with it", async () => {
  const { agent } = await makeUser(app);
  const project = await agent.post("/api/project").send({ name: "Doomed" }).expect(201).then((r) => r.body);

  await agent.post(`/api/project/${project._id}/pdfs`).expect(202);
  await waitForVersions(agent, `/api/project/${project._id}/pdfs`, 1);

  await agent.delete(`/api/project/${project._id}`).expect(200);

  assert.equal(await GeneratedPdf.countDocuments({}), 0, "a version pointing at deleted bytes is worse than none");
  assert.equal(await StoredFile.countDocuments({}), 0);
  assert.equal((await agent.get("/api/files/quota")).body.usedBytes, 0);
});

test("a renderer that is down leaves no version, no bytes and no quota charge", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Unrenderable" });

  stubRender(async () => {
    throw new Error("PDF rendering is unavailable");
  });

  // The request still succeeds: the failure belongs to the job, not the POST.
  await agent.post(`/api/todo/${todo._id}/pdfs`).expect(202);
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.deepEqual((await agent.get(`/api/todo/${todo._id}/pdfs`)).body, []);
  assert.equal(await StoredFile.countDocuments({}), 0);
  assert.equal((await agent.get("/api/files/quota")).body.usedBytes, 0);
  // The number it burned is not handed out again.
  assert.equal((await Todo.findById(todo._id)).pdfVersionSeq, 1);
});

test("a subject that is not yours answers 404 before anything is rendered", async () => {
  const { agent } = await makeUser(app);
  const { agent: stranger } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Mine" });

  await stranger.post(`/api/todo/${todo._id}/pdfs`).expect(404);
  assert.equal((await Todo.findById(todo._id)).pdfVersionSeq, 0, "a stranger must not burn a version");
});

// ------------------------------------------------- against the real thing ----

test("a real render round-trips through the API", { skip: !binaryPath() }, async (t) => {
  const { spawn } = require("node:child_process");
  const port = 8791;
  const key = "integration-key-0123456789";
  const child = spawn(binaryPath(), [], {
    env: { ...process.env, PDF_SERVICE_KEY: key, PDF_SERVICE_PORT: String(port) },
    stdio: "ignore",
  });

  const previous = { url: process.env.PDF_SERVICE_URL, key: process.env.PDF_SERVICE_KEY };
  process.env.PDF_SERVICE_URL = `http://127.0.0.1:${port}`;
  process.env.PDF_SERVICE_KEY = key;
  pdfClient.render = realRender;
  pdfClient.resetBreaker();

  t.after(() => {
    child.kill("SIGTERM");
    process.env.PDF_SERVICE_URL = previous.url;
    process.env.PDF_SERVICE_KEY = previous.key;
  });

  for (let i = 0; i < 50; i += 1) {
    if (await pdfClient.health()) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const { agent } = await makeUser(app);
  const project = await agent
    .post("/api/project")
    .send({ name: "Safety programme", organizationName: "Modern Todo Ltd", descriptionHtml: "<p>Scope</p>" })
    .expect(201)
    .then((r) => r.body);
  await createTodo(agent, { title: "Inspect the roof", projectId: project._id, priority: "high" });

  await agent.post(`/api/project/${project._id}/pdfs`).expect(202);
  const [version] = await waitForVersions(agent, `/api/project/${project._id}/pdfs`, 1);

  assert.ok(version.sizeBytes > 1000, "a one-page document should not be a stub");
  assert.ok(version.renderMs > 0);

  const download = await agent.get(`/api/project/${project._id}/pdfs/${version._id}?download=1`).expect(200);
  assert.equal(download.body.subarray(0, 5).toString(), "%PDF-");
  assert.equal(download.body.length, version.sizeBytes);
});
