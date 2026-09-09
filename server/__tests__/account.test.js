const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser, createTodo, request } = require("./helpers");
const { parseCsv } = require("../utils/csv");
const { generateCode } = require("../utils/totp");

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

// ------------------------------------------------------------ export ----

test("todos export as JSON with their project name resolved", async () => {
  const alice = await makeUser(app);
  const project = await alice.agent.post("/api/project").send({ name: "Website" }).expect(201);
  await createTodo(alice.agent, { title: "First", tags: ["a"], projectId: project.body._id });
  await createTodo(alice.agent, { title: "Second", priority: "high" });

  const res = await alice.agent.get("/api/account/export/todos?format=json").expect(200);

  assert.match(res.headers["content-disposition"], /attachment; filename="modern-todo-/);
  const body = JSON.parse(res.text);
  assert.equal(body.count, 2);
  assert.equal(body.todos.length, 2);
  assert.equal(body.todos.find((t) => t.title === "First").projectName, "Website");
  // The owner id is not part of an export - it means nothing outside the app.
  assert.equal(body.todos[0].ownerId, undefined);
});

test("todos export as CSV that parses back to the same rows", async () => {
  const alice = await makeUser(app);
  await createTodo(alice.agent, {
    title: 'Quote, "and" comma',
    tags: ["home", "urgent"],
    subtasks: [{ title: "one", done: true }, { title: "two" }],
    priority: "high",
  });

  const res = await alice.agent.get("/api/account/export/todos?format=csv").expect(200);
  assert.match(res.headers["content-type"], /text\/csv/);

  const rows = parseCsv(res.text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Quote, "and" comma');
  assert.equal(rows[0].tags, "home|urgent");
  assert.equal(rows[0].priority, "high");
  assert.equal(rows[0].subtasks, "[x] one|[ ] two");
});

test("an export only ever contains the caller's own data", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  await createTodo(alice.agent, { title: "Alice only" });
  await createTodo(bob.agent, { title: "Bob only" });

  const res = await alice.agent.get("/api/account/export/todos").expect(200);
  const body = JSON.parse(res.text);
  assert.equal(body.count, 1);
  assert.equal(body.todos[0].title, "Alice only");
});

test("the full account export carries every collection and no secrets", async () => {
  const alice = await makeUser(app);
  const todo = await createTodo(alice.agent, { title: "With a comment" });
  await alice.agent.post(`/api/todo/${todo._id}/comments`).send({ body: "hello" }).expect(201);
  await alice.agent.post("/api/project").send({ name: "Work" }).expect(201);

  const res = await alice.agent.get("/api/account/export").expect(200);
  const body = JSON.parse(res.text);

  assert.equal(body.account.email, alice.credentials.email);
  assert.equal(body.counts.todos, 1);
  assert.equal(body.counts.projects, 1);
  assert.equal(body.counts.comments, 1);
  assert.ok(Array.isArray(body.auditLog));
  assert.equal(res.text.includes(alice.credentials.password), false);
  assert.equal(body.account.password, undefined);
});

// ------------------------------------------------------------ import ----

const importPayload = (agent, body) => agent.post("/api/account/import").send(body);

test("a dry run reports what would happen and writes nothing", async () => {
  const alice = await makeUser(app);
  await createTodo(alice.agent, { title: "Existing" });

  const data = JSON.stringify([
    { title: "Fresh one", priority: "high", tags: ["imported"] },
    { title: "Existing" },
    { title: "", status: "pending" },
    { title: "Bad status", status: "nope" },
  ]);

  const res = await importPayload(alice.agent, { format: "json", data, dryRun: true }).expect(200);

  assert.equal(res.body.dryRun, true);
  assert.equal(res.body.total, 4);
  assert.equal(res.body.invalid, 2);
  assert.equal(res.body.duplicates, 1);
  assert.equal(res.body.willCreate, 1);
  assert.equal(res.body.created, 0);
  assert.equal(res.body.rejected.length, 2);

  const list = await alice.agent.get("/api/todo").expect(200);
  assert.equal(list.body.meta.totalRecords, 1);
});

test("importing for real creates the todos and any project named in the file", async () => {
  const alice = await makeUser(app);
  const data = JSON.stringify({
    todos: [
      { title: "Imported one", project: "Imported project", dueDate: "2030-01-01T00:00:00.000Z" },
      { title: "Imported two", subtasks: ["a", { title: "b", done: true }] },
    ],
  });

  const res = await importPayload(alice.agent, { format: "json", data, dryRun: false }).expect(200);
  assert.equal(res.body.created, 2);
  assert.equal(res.body.projectsCreated, 1);

  const list = await alice.agent.get("/api/todo").expect(200);
  assert.equal(list.body.meta.totalRecords, 2);

  const projects = await alice.agent.get("/api/project").expect(200);
  assert.equal(projects.body[0].name, "Imported project");

  const two = list.body.data.find((todo) => todo.title === "Imported two");
  assert.equal(two.subtasks.length, 2);
  assert.equal(two.subtasks[1].done, true);
});

test("a CSV export can be imported back into another account", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  await createTodo(alice.agent, { title: "Round trip", priority: "urgent", tags: ["x"] });

  const csv = (await alice.agent.get("/api/account/export/todos?format=csv").expect(200)).text;
  const res = await importPayload(bob.agent, { format: "csv", data: csv, dryRun: false }).expect(200);

  assert.equal(res.body.created, 1);
  const list = await bob.agent.get("/api/todo").expect(200);
  assert.equal(list.body.data[0].title, "Round trip");
  assert.equal(list.body.data[0].priority, "urgent");
  assert.deepEqual(list.body.data[0].tags, ["x"]);
});

test("import refuses input that is not a list of todos", async () => {
  const alice = await makeUser(app);
  await importPayload(alice.agent, { format: "json", data: "{ not json" }).expect(400);
  await importPayload(alice.agent, { format: "json", data: JSON.stringify({ nope: 1 }) }).expect(400);
  await importPayload(alice.agent, { format: "json", data: JSON.stringify([]) }).expect(400);
});

// ------------------------------------------------------- sample data ----

test("sample data seeds an empty account once", async () => {
  const alice = await makeUser(app);

  const res = await alice.agent.post("/api/account/sample-data").expect(201);
  assert.equal(res.body.projects, 2);
  assert.ok(res.body.todos >= 5);

  await alice.agent.post("/api/account/sample-data").expect(409);
});

// ---------------------------------------------------------- sessions ----

test("each login is a session, and revoking one kills only that token", async () => {
  const alice = await makeUser(app);

  const second = request.agent(app);
  await second
    .post("/api/user/login")
    .send({ email: alice.credentials.email, password: alice.credentials.password })
    .expect(200);

  const sessions = await alice.agent.get("/api/account/sessions").expect(200);
  assert.equal(sessions.body.length, 2);
  assert.equal(sessions.body.filter((session) => session.current).length, 1);

  const other = sessions.body.find((session) => !session.current);
  await alice.agent.delete(`/api/account/sessions/${other.id}`).expect(200);

  await second.get("/api/user/me").expect(401);
  await alice.agent.get("/api/user/me").expect(200);
});

test("revoking every session invalidates the current token too", async () => {
  const alice = await makeUser(app);
  await alice.agent.delete("/api/account/sessions/all").expect(200);
  await alice.agent.get("/api/user/me").expect(401);

  // A fresh login works again - the account is not locked, just signed out.
  const again = request.agent(app);
  await again
    .post("/api/user/login")
    .send({ email: alice.credentials.email, password: alice.credentials.password })
    .expect(200);
  await again.get("/api/user/me").expect(200);
});

test("changing the password signs the other devices out", async () => {
  const alice = await makeUser(app);
  const second = request.agent(app);
  await second
    .post("/api/user/login")
    .send({ email: alice.credentials.email, password: alice.credentials.password })
    .expect(200);

  await alice.agent
    .put("/api/user/password")
    .send({ currentPassword: alice.credentials.password, newPassword: "a-longer-password" })
    .expect(200);

  await second.get("/api/user/me").expect(401);
  await alice.agent.get("/api/user/me").expect(200);
});

test("logging out drops that session from the list", async () => {
  const alice = await makeUser(app);
  const second = request.agent(app);
  await second
    .post("/api/user/login")
    .send({ email: alice.credentials.email, password: alice.credentials.password })
    .expect(200);

  await second.post("/api/user/logout").expect(200);

  const sessions = await alice.agent.get("/api/account/sessions").expect(200);
  assert.equal(sessions.body.length, 1);
  assert.equal(sessions.body[0].current, true);
});

// --------------------------------------------------------------- 2FA ----

async function enableTwoFactor(agent) {
  const setup = await agent.post("/api/account/2fa/setup").expect(200);
  const code = generateCode(setup.body.secret);
  const enabled = await agent.post("/api/account/2fa/enable").send({ code }).expect(200);
  return { secret: setup.body.secret, recoveryCodes: enabled.body.recoveryCodes };
}

test("two-factor setup needs a real code, and hands back recovery codes", async () => {
  const alice = await makeUser(app);

  const setup = await alice.agent.post("/api/account/2fa/setup").expect(200);
  assert.equal(setup.body.secret.length, 32);
  assert.match(setup.body.otpauthUri, /^otpauth:\/\/totp\//);

  await alice.agent.post("/api/account/2fa/enable").send({ code: "000000" }).expect(400);

  const enabled = await alice.agent
    .post("/api/account/2fa/enable")
    .send({ code: generateCode(setup.body.secret) })
    .expect(200);
  assert.equal(enabled.body.recoveryCodes.length, 10);

  const me = await alice.agent.get("/api/user/me").expect(200);
  assert.equal(me.body.twoFactor.enabled, true);
  // The secret never travels to the client.
  assert.equal(me.body.twoFactor.secret, undefined);
});

test("login asks for the second factor and accepts a valid code", async () => {
  const alice = await makeUser(app);
  const { secret } = await enableTwoFactor(alice.agent);

  const fresh = request.agent(app);
  const challenge = await fresh
    .post("/api/user/login")
    .send({ email: alice.credentials.email, password: alice.credentials.password })
    .expect(200);

  assert.equal(challenge.body.twoFactorRequired, true);
  assert.equal(challenge.body._id, undefined);
  await fresh.get("/api/user/me").expect(401);

  await fresh
    .post("/api/user/login")
    .send({ email: alice.credentials.email, password: alice.credentials.password, code: "123456" })
    .expect(400);

  await fresh
    .post("/api/user/login")
    .send({ email: alice.credentials.email, password: alice.credentials.password, code: generateCode(secret) })
    .expect(200);
  await fresh.get("/api/user/me").expect(200);
});

test("a recovery code works once, and disabling 2FA needs the password", async () => {
  const alice = await makeUser(app);
  const { recoveryCodes } = await enableTwoFactor(alice.agent);
  const [recovery] = recoveryCodes;

  const fresh = request.agent(app);
  await fresh
    .post("/api/user/login")
    .send({ email: alice.credentials.email, password: alice.credentials.password, code: recovery })
    .expect(200);

  // The same code is spent now.
  const again = request.agent(app);
  await again
    .post("/api/user/login")
    .send({ email: alice.credentials.email, password: alice.credentials.password, code: recovery })
    .expect(400);

  await alice.agent.post("/api/account/2fa/disable").send({ password: "wrong-password" }).expect(400);
  await alice.agent.post("/api/account/2fa/disable").send({ password: alice.credentials.password }).expect(200);

  const plain = request.agent(app);
  await plain
    .post("/api/user/login")
    .send({ email: alice.credentials.email, password: alice.credentials.password })
    .expect(200);
});

// ------------------------------------------------------------- audit ----

test("the audit log records account events and is per user", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);

  await alice.agent.get("/api/account/export/todos").expect(200);
  await alice.agent
    .put("/api/user/password")
    .send({ currentPassword: alice.credentials.password, newPassword: "another-password" })
    .expect(200);

  const log = await alice.agent.get("/api/account/audit").expect(200);
  const actions = log.body.data.map((entry) => entry.action);

  assert.ok(actions.includes("login"));
  assert.ok(actions.includes("export.todos"));
  assert.ok(actions.includes("password.changed"));
  assert.equal(log.body.meta.totalRecords, actions.length);

  const bobLog = await bob.agent.get("/api/account/audit").expect(200);
  assert.equal(bobLog.body.data.every((entry) => entry.action === "login"), true);
});

// ---------------------------------------------------------- deletion ----

test("deleting an account needs the password and the word, then erases everything", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const todo = await createTodo(alice.agent, { title: "Goes away" });
  await alice.agent.post(`/api/todo/${todo._id}/comments`).send({ body: "bye" }).expect(201);
  await createTodo(bob.agent, { title: "Stays" });

  await alice.agent.delete("/api/account").send({ password: alice.credentials.password }).expect(400);
  await alice.agent
    .delete("/api/account")
    .send({ password: "not-the-password", confirm: "DELETE" })
    .expect(400);

  const res = await alice.agent
    .delete("/api/account")
    .send({ password: alice.credentials.password, confirm: "DELETE" })
    .expect(200);

  assert.equal(res.body.removed.todos, 1);
  assert.equal(res.body.removed.comments, 1);

  await alice.agent.get("/api/user/me").expect(401);
  await alice.agent
    .post("/api/user/login")
    .send({ email: alice.credentials.email, password: alice.credentials.password })
    .expect(400);

  // Bob is untouched.
  const bobList = await bob.agent.get("/api/todo").expect(200);
  assert.equal(bobList.body.meta.totalRecords, 1);
});
