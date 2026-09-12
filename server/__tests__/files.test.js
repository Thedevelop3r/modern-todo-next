const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const { connect, disconnect, reset, makeApp, makeUser, createTodo } = require("./helpers");
const { StoredFile, User } = require("../models");

let app;

test.before(async () => {
  await connect();
  app = makeApp();
});

test.after(async () => {
  await disconnect();
});

test.beforeEach(async () => {
  await reset();
});

// ------------------------------------------------------------ fixtures ----

/** A real 1x1 PNG, built here so the suite carries no binary files. */
function png() {
  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "latin1"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(typed) >>> 0 : 0);
    return Buffer.concat([length, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.from([0x00, 0xff, 0x00, 0x00]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A minimal but genuinely %PDF--headed document. */
const pdf = (padding = 200) =>
  Buffer.concat([Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"), Buffer.alloc(padding, 0x20), Buffer.from("\n%%EOF\n")]);

const upload = (agent, buffer, name, fields = {}) => {
  const req = agent.post("/api/files");
  Object.entries(fields).forEach(([key, value]) => req.field(key, String(value)));
  return req.attach("file", buffer, name);
};

const idOf = async (agent) => (await agent.get("/api/user/me").expect(200)).body._id;

// -------------------------------------------------------------- upload ----

test("an image uploads, lands ready, and counts against the quota", async () => {
  const { agent } = await makeUser(app);
  const bytes = png();

  const res = await upload(agent, bytes, "photo.png").expect(201);
  assert.ok(res.body.jobId, "an upload reports a job id");

  const file = res.body.file;
  assert.equal(file.state, "ready");
  assert.equal(file.kind, "image");
  assert.equal(file.mime, "image/png");
  assert.equal(file.filename, "photo.png");
  assert.equal(file.originalSize, bytes.length);
  assert.equal(file.storedSize, bytes.length);
  assert.equal(file.scope.kind, "user", "no target means the personal drive");
  assert.match(file.checksum, /^[a-f0-9]{64}$/);

  const quota = await agent.get("/api/files/quota").expect(200);
  assert.equal(quota.body.usedBytes, bytes.length, "the quota reflects the stored size exactly");
  assert.equal(quota.body.fileCount, 1);
});

test("the bytes decide the type, not the name or the header", async () => {
  const { agent } = await makeUser(app);

  // Claims to be a video; is actually a PNG.
  const res = await upload(agent, png(), "clip.mp4").expect(201);
  assert.equal(res.body.file.mime, "image/png");
  assert.equal(res.body.file.filename, "clip.png", "the extension follows the real type");
});

test("a disguised HTML file is refused outright", async () => {
  const { agent } = await makeUser(app);
  const html = Buffer.from("<html><script>alert(1)</script></html>padding to clear the sniff window");

  const res = await upload(agent, html, "innocent.mp4").expect(400);
  assert.match(res.body.message, /not supported/i);

  assert.equal(await StoredFile.countDocuments({}), 0, "nothing was stored");
});

test("a refused upload leaves no reservation behind", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  await upload(agent, Buffer.from("not a file type we accept, padded out a bit"), "x.mp4").expect(400);

  const user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, 0, "the reservation was released");
});

test("an empty upload is rejected", async () => {
  const { agent } = await makeUser(app);
  await upload(agent, Buffer.alloc(0), "empty.png").expect(400);
});

test("a request that is not multipart is rejected", async () => {
  const { agent } = await makeUser(app);
  await agent.post("/api/files").send({ nope: true }).expect(400);
});

test("a path-traversing filename is reduced to a bare name", async () => {
  const { agent } = await makeUser(app);
  const res = await upload(agent, png(), "../../../etc/passwd.png").expect(201);
  assert.equal(res.body.file.filename, "passwd.png");
});

test("a file over the plan's per-kind cap is refused with 413", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  // A PDF just over the free tier's 50 MB document cap.
  const big = pdf(50 * 1024 ** 2 + 1024);
  const res = await upload(agent, big, "huge.pdf").expect(413);
  assert.match(res.body.message, /plan/i);

  const user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, 0);
});

test("an upload that does not fit the quota is refused before any bytes are kept", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  await User.updateOne({ _id: userId }, { $set: { "storage.usedBytes": 1024 ** 3 - 10 } });

  await upload(agent, png(), "photo.png").expect(413);
  assert.equal(await StoredFile.countDocuments({ state: "ready" }), 0);
});

// --------------------------------------------------------------- scope ----

test("a file can be attached to a todo the caller owns", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "With an attachment" });

  const res = await upload(agent, png(), "shot.png", { scopeKind: "todo", scopeId: todo._id }).expect(201);
  assert.equal(res.body.file.scope.kind, "todo");
  assert.equal(res.body.file.scope.refId, todo._id);

  const list = await agent.get(`/api/files?scopeKind=todo&scopeId=${todo._id}`).expect(200);
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.meta.totalRecords, 1);
});

test("a file cannot be attached to someone else's todo", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const todo = await createTodo(alice.agent);

  await upload(bob.agent, png(), "shot.png", { scopeKind: "todo", scopeId: todo._id }).expect(404);
  assert.equal(await StoredFile.countDocuments({ state: "ready" }), 0);
});

test("an unknown attachment target is rejected", async () => {
  const { agent } = await makeUser(app);
  await upload(agent, png(), "a.png", { scopeKind: "nonsense" }).expect(400);
});

// ------------------------------------------------------------ isolation ----

test("one user cannot read, stream or delete another's file", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);

  const { body } = await upload(alice.agent, png(), "private.png").expect(201);
  const fileId = body.file._id;

  assert.equal((await bob.agent.get(`/api/files/${fileId}`)).status, 404);
  assert.equal((await bob.agent.get(`/api/files/${fileId}/raw`)).status, 404);
  assert.equal((await bob.agent.delete(`/api/files/${fileId}`)).status, 404);

  const bobList = await bob.agent.get("/api/files").expect(200);
  assert.equal(bobList.body.data.length, 0);
});

test("the file endpoints require a session", async () => {
  const { request } = require("./helpers");
  await request(app).get("/api/files").expect(401);
  await request(app).get("/api/files/quota").expect(401);
});

// -------------------------------------------------------------- stream ----

test("the bytes come back exactly as they went in", async () => {
  const { agent } = await makeUser(app);
  const bytes = png();
  const { body } = await upload(agent, bytes, "photo.png").expect(201);

  const res = await agent.get(`/api/files/${body.file._id}/raw`).expect(200);

  assert.deepEqual(res.body, bytes, "a round trip is byte-identical");
  assert.equal(res.headers["content-type"], "image/png");
  assert.equal(res.headers["accept-ranges"], "bytes");
  assert.equal(res.headers["content-length"], String(bytes.length));
  assert.match(res.headers["content-disposition"], /^inline;/, "an image is safe to show inline");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.match(res.headers["cache-control"], /private/, "authorized bytes are never shared-cached");
  assert.match(res.headers["content-security-policy"], /default-src 'none'/);
});

test("?download=1 forces an attachment", async () => {
  const { agent } = await makeUser(app);
  const { body } = await upload(agent, png(), "photo.png").expect(201);

  const res = await agent.get(`/api/files/${body.file._id}/raw?download=1`).expect(200);
  assert.match(res.headers["content-disposition"], /^attachment;/);
  assert.match(res.headers["content-disposition"], /filename\*=UTF-8''photo\.png/);
});

test("a range request answers 206 with the right slice", async () => {
  const { agent } = await makeUser(app);
  const bytes = pdf(4000);
  const { body } = await upload(agent, bytes, "doc.pdf").expect(201);
  const url = `/api/files/${body.file._id}/raw`;

  const res = await agent.get(url).set("Range", "bytes=10-19").expect(206);
  assert.equal(res.headers["content-range"], `bytes 10-19/${bytes.length}`);
  assert.equal(res.headers["content-length"], "10");
  assert.deepEqual(res.body, bytes.subarray(10, 20), "inclusive on both ends, off by nothing");
});

test("an open-ended range runs to the last byte", async () => {
  const { agent } = await makeUser(app);
  const bytes = pdf(1000);
  const { body } = await upload(agent, bytes, "doc.pdf").expect(201);

  const res = await agent.get(`/api/files/${body.file._id}/raw`).set("Range", "bytes=1000-").expect(206);
  assert.deepEqual(res.body, bytes.subarray(1000));
  assert.equal(res.headers["content-range"], `bytes 1000-${bytes.length - 1}/${bytes.length}`);
});

test("a suffix range returns the tail", async () => {
  const { agent } = await makeUser(app);
  const bytes = pdf(1000);
  const { body } = await upload(agent, bytes, "doc.pdf").expect(201);

  const res = await agent.get(`/api/files/${body.file._id}/raw`).set("Range", "bytes=-50").expect(206);
  assert.deepEqual(res.body, bytes.subarray(bytes.length - 50));
});

test("an unsatisfiable range answers 416 and says how big the file is", async () => {
  const { agent } = await makeUser(app);
  const bytes = pdf(300);
  const { body } = await upload(agent, bytes, "doc.pdf").expect(201);

  const res = await agent.get(`/api/files/${body.file._id}/raw`).set("Range", "bytes=99999-").expect(416);
  assert.equal(res.headers["content-range"], `bytes */${bytes.length}`);
});

test("a garbled range header falls back rather than serving nonsense", async () => {
  const { agent } = await makeUser(app);
  const { body } = await upload(agent, pdf(300), "doc.pdf").expect(201);

  await agent.get(`/api/files/${body.file._id}/raw`).set("Range", "kilobytes=1-2").expect(416);
});

test("a matching ETag answers 304, and a stale If-Range sends the whole file", async () => {
  const { agent } = await makeUser(app);
  const bytes = pdf(500);
  const { body } = await upload(agent, bytes, "doc.pdf").expect(201);
  const url = `/api/files/${body.file._id}/raw`;

  const first = await agent.get(url).expect(200);
  const etag = first.headers.etag;
  assert.ok(etag);

  await agent.get(url).set("If-None-Match", etag).expect(304);

  const stale = await agent.get(url).set("If-Range", '"nope"').set("Range", "bytes=0-9").expect(200);
  assert.equal(stale.headers["content-length"], String(bytes.length));
});

test("HEAD reports the size without sending the body", async () => {
  const { agent } = await makeUser(app);
  const bytes = pdf(700);
  const { body } = await upload(agent, bytes, "doc.pdf").expect(201);

  const res = await agent.head(`/api/files/${body.file._id}/raw`).expect(200);
  assert.equal(res.headers["content-length"], String(bytes.length));
  assert.equal(res.headers["accept-ranges"], "bytes");
});

// -------------------------------------------------------------- delete ----

test("deleting a file removes the bytes and credits the quota", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);
  const bytes = png();
  const { body } = await upload(agent, bytes, "photo.png").expect(201);

  const before = await User.findById(userId).select("storage");
  assert.equal(before.storage.usedBytes, bytes.length);

  const res = await agent.delete(`/api/files/${body.file._id}`).expect(200);
  assert.equal(res.body.deleted, true);
  assert.equal(res.body.freedBytes, bytes.length);

  const after = await User.findById(userId).select("storage");
  assert.equal(after.storage.usedBytes, 0);

  await agent.get(`/api/files/${body.file._id}`).expect(404);
  await agent.get(`/api/files/${body.file._id}/raw`).expect(404);

  // The chunks went with it - nothing orphaned in the bucket.
  const mongoose = require("mongoose");
  assert.equal(await mongoose.connection.db.collection("files.chunks").countDocuments({}), 0);
  assert.equal(await mongoose.connection.db.collection("files.files").countDocuments({}), 0);
});

test("a missing file id is a 404, not a crash", async () => {
  const { agent } = await makeUser(app);
  await agent.get("/api/files/64b7f9c2e1a3b4c5d6e7f801").expect(404);
  await agent.get("/api/files/not-an-id").expect(400);
});

// --------------------------------------------------------------- quota ----

test("the tier endpoint moves the quota and the caps", async () => {
  const { agent } = await makeUser(app);

  const res = await agent.put("/api/files/quota/tier").send({ tier: "25gb", perFileTier: "plus" }).expect(200);
  assert.equal(res.body.tier, "25gb");
  assert.equal(res.body.quotaBytes, 25 * 1024 ** 3);
  assert.equal(res.body.caps.video, 600 * 1024 ** 2);
});

test("an unknown tier is rejected by validation", async () => {
  const { agent } = await makeUser(app);
  await agent.put("/api/files/quota/tier").send({ tier: "1tb" }).expect(400);
});

test("a bigger per-file tier lets a previously refused file through", async () => {
  const { agent } = await makeUser(app);

  // 60 MB is over the free document cap of 50 MB.
  const big = pdf(60 * 1024 ** 2);
  await upload(agent, big, "report.pdf").expect(413);

  await agent.put("/api/files/quota/tier").send({ perFileTier: "plus" }).expect(200);
  const res = await upload(agent, big, "report.pdf").expect(201);
  assert.equal(res.body.file.state, "ready");
});

// ------------------------------------------------------------- cascade ----

test("a todo's attachments survive the trash and die with the permanent delete", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);
  const todo = await createTodo(agent, { title: "Has a file" });
  const bytes = png();

  const { body } = await upload(agent, bytes, "a.png", { scopeKind: "todo", scopeId: todo._id }).expect(201);

  // Moving to trash is recoverable, so the file must still be there.
  await agent.delete(`/api/todo/${todo._id}`).expect(200);
  await agent.get(`/api/files/${body.file._id}`).expect(200);

  // A trash row carries its own id; the original todo id lives on as `todoId`.
  const trash = await agent.get("/api/trash").expect(200);
  const trashId = trash.body.data[0]._id;

  await agent.delete(`/api/trash/${trashId}`).expect(200);
  await agent.get(`/api/files/${body.file._id}`).expect(404);

  const user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, 0, "the space came back");
});

test("emptying the trash takes every attached file with it", async () => {
  const { agent } = await makeUser(app);
  const first = await createTodo(agent, { title: "One" });
  const second = await createTodo(agent, { title: "Two" });

  await upload(agent, png(), "a.png", { scopeKind: "todo", scopeId: first._id }).expect(201);
  await upload(agent, png(), "b.png", { scopeKind: "todo", scopeId: second._id }).expect(201);

  await agent.delete(`/api/todo/${first._id}`).expect(200);
  await agent.delete(`/api/todo/${second._id}`).expect(200);
  await agent.delete("/api/trash").expect(200);

  assert.equal(await StoredFile.countDocuments({}), 0);
});

test("deleting a project drops its own files but not its todos'", async () => {
  const { agent } = await makeUser(app);
  const project = await (async () =>
    (await agent.post("/api/project").send({ name: "Work" }).expect(201)).body)();
  const todo = await createTodo(agent, { title: "In the project", projectId: project._id });

  const onProject = await upload(agent, png(), "brief.png", {
    scopeKind: "project",
    scopeId: project._id,
  }).expect(201);
  const onTodo = await upload(agent, png(), "shot.png", {
    scopeKind: "todo",
    scopeId: todo._id,
  }).expect(201);

  const res = await agent.delete(`/api/project/${project._id}`).expect(200);
  assert.equal(res.body.filesDeleted, 1);

  await agent.get(`/api/files/${onProject.body.file._id}`).expect(404);
  await agent.get(`/api/files/${onTodo.body.file._id}`).expect(200);
});

test("deleting the account erases every stored byte", async () => {
  const { agent, credentials } = await makeUser(app);
  await upload(agent, png(), "a.png").expect(201);
  await upload(agent, pdf(500), "b.pdf").expect(201);

  const res = await agent
    .delete("/api/account")
    .send({ password: credentials.password, confirm: "DELETE" })
    .expect(200);

  assert.equal(res.body.removed.files, 2);
  assert.equal(await StoredFile.countDocuments({}), 0);

  const mongoose = require("mongoose");
  assert.equal(await mongoose.connection.db.collection("files.chunks").countDocuments({}), 0);
});
