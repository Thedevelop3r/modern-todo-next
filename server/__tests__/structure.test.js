const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser, createTodo } = require("./helpers");

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

const createProject = (agent, overrides = {}) =>
  agent
    .post("/api/project")
    .send({ name: "Work", ...overrides })
    .expect(201)
    .then((res) => res.body);

// ---------------------------------------------------------- projects ----

test("projects are created, listed with counts, and scoped per user", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);

  const project = await createProject(alice.agent, { name: "Website", color: "teal" });
  await createTodo(alice.agent, { title: "a", projectId: project._id, estimate: 3 });
  await createTodo(alice.agent, { title: "b", projectId: project._id, status: "completed", estimate: 2 });
  await createProject(bob.agent, { name: "Bob's" });

  const list = await alice.agent.get("/api/project").expect(200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].name, "Website");
  assert.equal(list.body[0].todoCount, 2);
  assert.equal(list.body[0].completedCount, 1);
  assert.equal(list.body[0].estimateTotal, 5);

  const bobList = await bob.agent.get("/api/project").expect(200);
  assert.equal(bobList.body.length, 1);
  assert.equal(bobList.body[0].name, "Bob's");
});

test("a project cannot be read or updated by another user", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const project = await createProject(alice.agent);

  assert.equal((await bob.agent.get(`/api/project/${project._id}`)).status, 404);
  assert.equal((await bob.agent.put(`/api/project/${project._id}`).send({ name: "hacked" })).status, 404);
  assert.equal((await bob.agent.delete(`/api/project/${project._id}`)).status, 404);
});

test("deleting a project unassigns its todos instead of deleting them", async () => {
  const { agent } = await makeUser(app);
  const project = await createProject(agent);
  await createTodo(agent, { title: "keeps living", projectId: project._id });

  const result = await agent.delete(`/api/project/${project._id}`).expect(200);
  assert.equal(result.body.unassigned, 1);

  const todos = await agent.get("/api/todo").expect(200);
  assert.equal(todos.body.meta.totalRecords, 1, "the todo survives");
  assert.equal(todos.body.data[0].projectId, null);
});

test("todos filter by project, and by having no project", async () => {
  const { agent } = await makeUser(app);
  const project = await createProject(agent);
  await createTodo(agent, { title: "in project", projectId: project._id });
  await createTodo(agent, { title: "loose" });

  const inProject = await agent.get(`/api/todo?projectId=${project._id}`).expect(200);
  assert.equal(inProject.body.data.length, 1);
  assert.equal(inProject.body.data[0].title, "in project");

  const none = await agent.get("/api/todo?projectId=none").expect(200);
  assert.equal(none.body.data.length, 1);
  assert.equal(none.body.data[0].title, "loose");
});

test("assigning a todo to someone else's project is rejected", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const project = await createProject(bob.agent);
  const todo = await createTodo(alice.agent);

  const res = await alice.agent.put(`/api/todo/${todo._id}`).send({ projectId: project._id });
  assert.equal(res.status, 400);
});

test("bulk project assignment moves many todos at once", async () => {
  const { agent } = await makeUser(app);
  const project = await createProject(agent);
  const a = await createTodo(agent, { title: "a" });
  const b = await createTodo(agent, { title: "b" });

  const res = await agent
    .patch("/api/todo/bulk")
    .send({ ids: [a._id, b._id], action: "project", value: project._id })
    .expect(200);

  assert.equal(res.body.modified, 2);
  assert.equal((await agent.get(`/api/todo?projectId=${project._id}`).expect(200)).body.data.length, 2);
});

// ------------------------------------------------- dates and effort ----

test("start date and estimate round-trip and sort", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "later", startDate: "2030-06-01T00:00:00.000Z", estimate: 8 });
  await createTodo(agent, { title: "sooner", startDate: "2030-01-01T00:00:00.000Z", estimate: 1 });

  const byStart = await agent.get("/api/todo?sort=startDate&order=asc").expect(200);
  assert.deepEqual(byStart.body.data.map((t) => t.title), ["sooner", "later"]);

  const byEstimate = await agent.get("/api/todo?sort=estimate&order=desc").expect(200);
  assert.equal(byEstimate.body.data[0].estimate, 8);
});

test("an estimate of zero is kept distinct from no estimate", async () => {
  const { agent } = await makeUser(app);
  const zero = await createTodo(agent, { title: "zero", estimate: 0 });
  const none = await createTodo(agent, { title: "none" });

  assert.equal(zero.estimate, 0);
  assert.equal(none.estimate, null);
});

// ----------------------------------------------------- time tracking ----

test("a timer accumulates time and only one runs at a time", async () => {
  const { agent } = await makeUser(app);
  const a = await createTodo(agent, { title: "a" });
  const b = await createTodo(agent, { title: "b" });

  const started = await agent.post(`/api/todo/${a._id}/timer/start`).expect(200);
  assert.ok(started.body.timerStartedAt, "timer should be running");

  // Starting b must bank and clear a's timer.
  await agent.post(`/api/todo/${b._id}/timer/start`).expect(200);
  const aAfter = await agent.get(`/api/todo/${a._id}`).expect(200);
  assert.equal(aAfter.body.timerStartedAt, null, "the other timer should have stopped");

  const stopped = await agent.post(`/api/todo/${b._id}/timer/stop`).expect(200);
  assert.equal(stopped.body.timerStartedAt, null);
  assert.equal(typeof stopped.body.timeSpent, "number");
});

test("stopping a timer that is not running is harmless", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent);
  const res = await agent.post(`/api/todo/${todo._id}/timer/stop`).expect(200);
  assert.equal(res.body.timeSpent, 0);
});

// -------------------------------------------------------- comments ----

test("comments are created, listed, edited and deleted", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent);

  const created = await agent.post(`/api/todo/${todo._id}/comments`).send({ body: "First note" }).expect(201);
  assert.equal(created.body.body, "First note");

  const list = await agent.get(`/api/todo/${todo._id}/comments`).expect(200);
  assert.equal(list.body.length, 1);

  const edited = await agent
    .put(`/api/todo/comments/${created.body._id}`)
    .send({ body: "Edited note" })
    .expect(200);
  assert.equal(edited.body.body, "Edited note");
  assert.ok(edited.body.editedAt);

  await agent.delete(`/api/todo/comments/${created.body._id}`).expect(200);
  assert.equal((await agent.get(`/api/todo/${todo._id}/comments`).expect(200)).body.length, 0);
});

test("comments reject empty bodies and other users", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const todo = await createTodo(alice.agent);

  assert.equal((await alice.agent.post(`/api/todo/${todo._id}/comments`).send({ body: "  " })).status, 400);
  assert.equal((await bob.agent.get(`/api/todo/${todo._id}/comments`)).status, 404);
  assert.equal((await bob.agent.post(`/api/todo/${todo._id}/comments`).send({ body: "hi" })).status, 404);
});

test("deleting a todo removes its comments", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent);
  await agent.post(`/api/todo/${todo._id}/comments`).send({ body: "note" }).expect(201);

  await agent.delete(`/api/todo/${todo._id}`).expect(200);

  // The todo is gone, so the comment endpoint 404s rather than leaking rows.
  assert.equal((await agent.get(`/api/todo/${todo._id}/comments`)).status, 404);
});

// -------------------------------------------------------- activity ----

test("activity records creation and field changes", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Original" });

  await agent.put(`/api/todo/${todo._id}`).send({ status: "progress", priority: "high" }).expect(200);

  const activity = await agent.get(`/api/todo/${todo._id}/activity`).expect(200);
  const actions = activity.body.map((row) => `${row.action}:${row.field || ""}`);

  assert.ok(actions.includes("created:"), "creation is recorded");
  assert.ok(actions.includes("updated:status"), "status change is recorded");
  assert.ok(actions.includes("updated:priority"), "priority change is recorded");

  const statusRow = activity.body.find((row) => row.field === "status");
  assert.equal(statusRow.from, "pending");
  assert.equal(statusRow.to, "progress");
});

test("an update that changes nothing records no activity", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Same" });

  await agent.put(`/api/todo/${todo._id}`).send({ title: "Same" }).expect(200);

  const activity = await agent.get(`/api/todo/${todo._id}/activity`).expect(200);
  assert.equal(activity.body.filter((row) => row.action === "updated").length, 0);
});

// ---------------------------------------------------- dependencies ----

test("a todo cannot block itself", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent);

  const res = await agent.put(`/api/todo/${todo._id}`).send({ blockedBy: [todo._id] });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /cannot block itself/);
});

test("a dependency cycle is refused", async () => {
  const { agent } = await makeUser(app);
  const a = await createTodo(agent, { title: "a" });
  const b = await createTodo(agent, { title: "b" });

  await agent.put(`/api/todo/${b._id}`).send({ blockedBy: [a._id] }).expect(200);

  // a blocked by b would close the loop a -> b -> a.
  const res = await agent.put(`/api/todo/${a._id}`).send({ blockedBy: [b._id] });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /cycle/);
});

test("a longer cycle is also refused", async () => {
  const { agent } = await makeUser(app);
  const a = await createTodo(agent, { title: "a" });
  const b = await createTodo(agent, { title: "b" });
  const c = await createTodo(agent, { title: "c" });

  await agent.put(`/api/todo/${b._id}`).send({ blockedBy: [a._id] }).expect(200);
  await agent.put(`/api/todo/${c._id}`).send({ blockedBy: [b._id] }).expect(200);

  const res = await agent.put(`/api/todo/${a._id}`).send({ blockedBy: [c._id] });
  assert.equal(res.status, 400);
});

test("dependencies must belong to the same user", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const mine = await createTodo(alice.agent, { title: "mine" });
  const theirs = await createTodo(bob.agent, { title: "theirs" });

  const res = await alice.agent.put(`/api/todo/${mine._id}`).send({ blockedBy: [theirs._id] });
  assert.equal(res.status, 400);
});

test("a blocked todo cannot be completed until its blockers are done", async () => {
  const { agent } = await makeUser(app);
  const blocker = await createTodo(agent, { title: "blocker" });
  const blocked = await createTodo(agent, { title: "blocked" });

  await agent.put(`/api/todo/${blocked._id}`).send({ blockedBy: [blocker._id] }).expect(200);

  const refused = await agent.put(`/api/todo/${blocked._id}`).send({ status: "completed" });
  assert.equal(refused.status, 400);
  assert.match(refused.body.message, /Blocked by/);

  await agent.put(`/api/todo/${blocker._id}`).send({ status: "completed" }).expect(200);
  const allowed = await agent.put(`/api/todo/${blocked._id}`).send({ status: "completed" }).expect(200);
  assert.equal(allowed.body.status, "completed");
});

test("deleting a blocker clears it from the todos it blocked", async () => {
  const { agent } = await makeUser(app);
  const blocker = await createTodo(agent, { title: "blocker" });
  const blocked = await createTodo(agent, { title: "blocked" });
  await agent.put(`/api/todo/${blocked._id}`).send({ blockedBy: [blocker._id] }).expect(200);

  await agent.delete(`/api/todo/${blocker._id}`).expect(200);

  const after = await agent.get(`/api/todo/${blocked._id}`).expect(200);
  assert.deepEqual(after.body.blockedBy, [], "the dangling dependency is removed");

  // And it can now be completed.
  await agent.put(`/api/todo/${blocked._id}`).send({ status: "completed" }).expect(200);
});

test("the blocked filter separates blocked from free todos", async () => {
  const { agent } = await makeUser(app);
  const blocker = await createTodo(agent, { title: "blocker" });
  const blocked = await createTodo(agent, { title: "blocked" });
  await agent.put(`/api/todo/${blocked._id}`).send({ blockedBy: [blocker._id] }).expect(200);

  const isBlocked = await agent.get("/api/todo?blocked=true").expect(200);
  assert.deepEqual(isBlocked.body.data.map((t) => t.title), ["blocked"]);

  const notBlocked = await agent.get("/api/todo?blocked=false").expect(200);
  assert.deepEqual(notBlocked.body.data.map((t) => t.title), ["blocker"]);
});
