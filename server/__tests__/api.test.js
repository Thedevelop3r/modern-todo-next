const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser, createTodo, request } = require("./helpers");

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

// ---------------------------------------------------------------- auth ----

test("register rejects a short password", async () => {
  const res = await request(app)
    .post("/api/user/register")
    .send({ name: "Ann", email: "ann@example.com", password: "short" });

  assert.equal(res.status, 400);
  assert.match(res.body.message, /at least 8 characters/);
});

test("register rejects a duplicate email", async () => {
  const body = { name: "Ann", email: "dup@example.com", password: "password123" };
  await request(app).post("/api/user/register").send(body).expect(201);

  const res = await request(app).post("/api/user/register").send(body);
  assert.equal(res.status, 409);
});

test("register never returns the password hash", async () => {
  const res = await request(app)
    .post("/api/user/register")
    .send({ name: "Ann", email: "safe@example.com", password: "password123" })
    .expect(201);

  assert.equal(res.body.password, undefined);
});

test("login with bad credentials gives a generic message", async () => {
  await makeUser(app, { email: "real@example.com" });

  const res = await request(app)
    .post("/api/user/login")
    .send({ email: "real@example.com", password: "wrongpassword" });

  assert.equal(res.status, 400);
  assert.equal(res.body.message, "Invalid email or password");
});

test("protected routes reject an anonymous caller", async () => {
  for (const path of ["/api/todo", "/api/trash", "/api/stats", "/api/tags"]) {
    const res = await request(app).get(path);
    assert.equal(res.status, 401, `${path} should be protected`);
  }
});

test("login sets a session cookie that /me accepts", async () => {
  const { agent, user } = await makeUser(app);
  const res = await agent.get("/api/user/me").expect(200);
  assert.equal(res.body.email, user.email);
  assert.equal(res.body.password, undefined);
});

// ----------------------------------------------------------- todo CRUD ----

test("create applies defaults and rejects an empty title", async () => {
  const { agent } = await makeUser(app);

  const todo = await createTodo(agent, { title: "Write the docs" });
  assert.equal(todo.status, "pending");
  assert.equal(todo.priority, "none");
  assert.deepEqual(todo.tags, []);
  assert.equal(todo.archived, false);

  const bad = await agent.post("/api/todo").send({ title: "   " });
  assert.equal(bad.status, 400);
});

test("create accepts the full field set", async () => {
  const { agent } = await makeUser(app);
  const dueDate = new Date("2030-01-15T12:00:00.000Z").toISOString();

  const todo = await createTodo(agent, {
    title: "Full todo",
    description: "With everything",
    status: "progress",
    priority: "high",
    tags: ["work", "urgent"],
    subtasks: [{ title: "step one", done: true }, { title: "step two" }],
    dueDate,
    recurrence: "weekly",
    pinned: true,
  });

  assert.equal(todo.priority, "high");
  assert.deepEqual(todo.tags, ["work", "urgent"]);
  assert.equal(todo.subtasks.length, 2);
  assert.equal(todo.subtasks[0].done, true);
  assert.equal(todo.subtasks[1].done, false);
  assert.equal(todo.pinned, true);
  assert.equal(new Date(todo.dueDate).toISOString(), dueDate);
});

test("completing a todo stamps completedAt, reopening clears it", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent);

  const done = await agent.put(`/api/todo/${todo._id}`).send({ status: "completed" }).expect(200);
  assert.ok(done.body.completedAt, "completedAt should be set");

  const reopened = await agent.put(`/api/todo/${todo._id}`).send({ status: "pending" }).expect(200);
  assert.equal(reopened.body.completedAt, null);
});

test("deleting a missing todo is a 404, not a 500", async () => {
  const { agent } = await makeUser(app);
  const res = await agent.delete("/api/todo/507f1f77bcf86cd799439011");
  assert.equal(res.status, 404);
});

test("a malformed id is a 400, not a crash", async () => {
  const { agent } = await makeUser(app);
  const res = await agent.get("/api/todo/not-a-valid-id");
  assert.equal(res.status, 400);
});

test("duplicate copies content but resets progress", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, {
    title: "Original",
    status: "completed",
    tags: ["a"],
    subtasks: [{ title: "one", done: true }],
  });

  const copy = await agent.post(`/api/todo/${todo._id}/duplicate`).expect(201);
  assert.equal(copy.body.title, "Original (copy)");
  assert.equal(copy.body.status, "pending");
  assert.equal(copy.body.subtasks[0].done, false);
  assert.notEqual(copy.body._id, todo._id);
});

// -------------------------------------------------------- ownership ----

test("one user cannot read, update or delete another user's todo", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const todo = await createTodo(alice.agent, { title: "Alice private" });

  assert.equal((await bob.agent.get(`/api/todo/${todo._id}`)).status, 404);
  assert.equal((await bob.agent.put(`/api/todo/${todo._id}`).send({ title: "hacked" })).status, 404);
  assert.equal((await bob.agent.delete(`/api/todo/${todo._id}`)).status, 404);

  const stillThere = await alice.agent.get(`/api/todo/${todo._id}`).expect(200);
  assert.equal(stillThere.body.title, "Alice private");
});

test("pagination totals count only the caller's todos", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);

  for (let i = 0; i < 5; i++) await createTodo(alice.agent, { title: `Alice ${i}` });
  for (let i = 0; i < 3; i++) await createTodo(bob.agent, { title: `Bob ${i}` });

  const res = await bob.agent.get("/api/todo?limit=2").expect(200);
  assert.equal(res.body.meta.totalRecords, 3, "totals must be scoped to the owner");
  assert.equal(res.body.meta.totalPages, 2);
  assert.equal(res.body.data.length, 2);
  assert.ok(res.body.data.every((t) => t.title.startsWith("Bob")));
});

// --------------------------------------------------- search / filter ----

test("search matches title, description and tags", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "Buy milk" });
  await createTodo(agent, { title: "Other", description: "remember the milk" });
  await createTodo(agent, { title: "Tagged", tags: ["milk"] });
  await createTodo(agent, { title: "Unrelated" });

  const res = await agent.get("/api/todo?q=milk").expect(200);
  assert.equal(res.body.meta.totalRecords, 3);
});

test("search is case-insensitive and safe against regex metacharacters", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "Deploy (v2)" });

  assert.equal((await agent.get("/api/todo?q=deploy").expect(200)).body.data.length, 1);
  // A bare "(" would be an invalid regex if it were not escaped.
  const res = await agent.get("/api/todo?q=%28v2%29").expect(200);
  assert.equal(res.body.data.length, 1);
});

test("status and priority filters accept multiple values", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "a", status: "pending", priority: "low" });
  await createTodo(agent, { title: "b", status: "progress", priority: "high" });
  await createTodo(agent, { title: "c", status: "completed", priority: "urgent" });

  const res = await agent.get("/api/todo?status=pending,progress").expect(200);
  assert.equal(res.body.meta.totalRecords, 2);

  const byPriority = await agent.get("/api/todo?priority=high&priority=urgent").expect(200);
  assert.equal(byPriority.body.meta.totalRecords, 2);
});

test("tag filter requires every requested tag", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "both", tags: ["work", "urgent"] });
  await createTodo(agent, { title: "one", tags: ["work"] });

  const res = await agent.get("/api/todo?tags=work,urgent").expect(200);
  assert.equal(res.body.meta.totalRecords, 1);
  assert.equal(res.body.data[0].title, "both");
});

test("due filters split overdue from today", async () => {
  const { agent } = await makeUser(app);
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const today = new Date().toISOString();

  await createTodo(agent, { title: "late", dueDate: yesterday });
  await createTodo(agent, { title: "now", dueDate: today });
  await createTodo(agent, { title: "someday" });

  assert.equal((await agent.get("/api/todo?due=overdue").expect(200)).body.data[0].title, "late");
  assert.equal((await agent.get("/api/todo?due=today").expect(200)).body.data[0].title, "now");
  assert.equal((await agent.get("/api/todo?due=none").expect(200)).body.data[0].title, "someday");
});

test("archived todos are hidden by default and listed on request", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "visible" });
  await createTodo(agent, { title: "filed", archived: true });

  const active = await agent.get("/api/todo").expect(200);
  assert.equal(active.body.meta.totalRecords, 1);
  assert.equal(active.body.data[0].title, "visible");

  const archived = await agent.get("/api/todo?archived=true").expect(200);
  assert.equal(archived.body.meta.totalRecords, 1);
  assert.equal(archived.body.data[0].title, "filed");
});

test("pinned todos sort first regardless of sort order", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "older" });
  await createTodo(agent, { title: "pinned old", pinned: true });
  await createTodo(agent, { title: "newest" });

  const res = await agent.get("/api/todo?sort=createdAt&order=desc").expect(200);
  assert.equal(res.body.data[0].title, "pinned old");
});

test("priority sorting ranks the enum rather than sorting alphabetically", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "low one", priority: "low" });
  await createTodo(agent, { title: "urgent one", priority: "urgent" });
  await createTodo(agent, { title: "medium one", priority: "medium" });

  const res = await agent.get("/api/todo?sort=priority&order=desc").expect(200);
  assert.deepEqual(
    res.body.data.map((t) => t.priority),
    ["urgent", "medium", "low"]
  );
});

test("an invalid sort field is rejected", async () => {
  const { agent } = await makeUser(app);
  const res = await agent.get("/api/todo?sort=password");
  assert.equal(res.status, 400);
});

// ------------------------------------------------------------- bulk ----

test("bulk status update only touches the caller's todos", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const mine = await createTodo(alice.agent, { title: "mine" });
  const theirs = await createTodo(bob.agent, { title: "theirs" });

  const res = await alice.agent
    .patch("/api/todo/bulk")
    .send({ ids: [mine._id, theirs._id], action: "status", value: "completed" })
    .expect(200);

  assert.equal(res.body.modified, 1, "must not modify another user's todo");
  const bobsTodo = await bob.agent.get(`/api/todo/${theirs._id}`).expect(200);
  assert.equal(bobsTodo.body.status, "pending");
});

test("bulk tag and untag are additive and removable", async () => {
  const { agent } = await makeUser(app);
  const a = await createTodo(agent, { title: "a" });
  const b = await createTodo(agent, { title: "b", tags: ["keep"] });

  await agent.patch("/api/todo/bulk").send({ ids: [a._id, b._id], action: "tag", value: "sprint" }).expect(200);
  const tagged = await agent.get("/api/todo?tags=sprint").expect(200);
  assert.equal(tagged.body.meta.totalRecords, 2);

  await agent.patch("/api/todo/bulk").send({ ids: [a._id, b._id], action: "untag", value: "sprint" }).expect(200);
  assert.equal((await agent.get("/api/todo?tags=sprint").expect(200)).body.meta.totalRecords, 0);
  // The pre-existing tag survives.
  assert.equal((await agent.get("/api/todo?tags=keep").expect(200)).body.meta.totalRecords, 1);
});

test("bulk delete moves every item to trash", async () => {
  const { agent } = await makeUser(app);
  const a = await createTodo(agent, { title: "a" });
  const b = await createTodo(agent, { title: "b" });

  const res = await agent.patch("/api/todo/bulk").send({ ids: [a._id, b._id], action: "delete" }).expect(200);
  assert.equal(res.body.modified, 2);
  assert.equal((await agent.get("/api/todo").expect(200)).body.meta.totalRecords, 0);
  assert.equal((await agent.get("/api/trash").expect(200)).body.meta.totalRecords, 2);
});

test("bulk rejects an empty id list and an unknown action", async () => {
  const { agent } = await makeUser(app);
  assert.equal((await agent.patch("/api/todo/bulk").send({ ids: [], action: "pin" })).status, 400);
  assert.equal((await agent.patch("/api/todo/bulk").send({ ids: ["x"], action: "explode" })).status, 400);
});

test("reorder writes the given order and ignores foreign ids", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const a = await createTodo(alice.agent, { title: "a" });
  const b = await createTodo(alice.agent, { title: "b" });
  const theirs = await createTodo(bob.agent, { title: "theirs" });

  await alice.agent.put("/api/todo/reorder").send({ ids: [b._id, a._id, theirs._id] }).expect(200);

  const res = await alice.agent.get("/api/todo?sort=order&order=asc").expect(200);
  assert.deepEqual(
    res.body.data.map((t) => t.title),
    ["b", "a"]
  );
});

// ------------------------------------------------------------ trash ----

test("delete moves a todo to trash and recover restores its original id", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Round trip", tags: ["x"], priority: "high" });

  await agent.delete(`/api/todo/${todo._id}`).expect(200);
  const trash = await agent.get("/api/trash").expect(200);
  assert.equal(trash.body.meta.totalRecords, 1);
  assert.equal(trash.body.data[0].todoId, todo._id);

  const recovered = await agent.put(`/api/trash/${trash.body.data[0]._id}`).expect(200);
  assert.equal(recovered.body._id, todo._id, "recovered todo keeps its original id");
  assert.equal(recovered.body.title, "Round trip");
  assert.equal(recovered.body.priority, "high");
  assert.deepEqual(recovered.body.tags, ["x"]);
  assert.equal(recovered.body.todoId, undefined, "todoId must not leak onto the restored todo");

  assert.equal((await agent.get("/api/trash").expect(200)).body.meta.totalRecords, 0);
  assert.equal((await agent.get("/api/todo").expect(200)).body.meta.totalRecords, 1);
});

test("trash is per-user and empties on request", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const todo = await createTodo(alice.agent, { title: "a" });
  await alice.agent.delete(`/api/todo/${todo._id}`).expect(200);

  assert.equal((await bob.agent.get("/api/trash").expect(200)).body.meta.totalRecords, 0);

  const emptied = await alice.agent.delete("/api/trash").expect(200);
  assert.equal(emptied.body.deleted, 1);
  assert.equal((await alice.agent.get("/api/trash").expect(200)).body.meta.totalRecords, 0);
});

// ------------------------------------------------------- recurrence ----

test("completing a recurring todo spawns the next occurrence", async () => {
  const { agent } = await makeUser(app);
  const dueDate = new Date("2030-03-01T10:00:00.000Z").toISOString();
  const todo = await createTodo(agent, { title: "Standup", recurrence: "daily", dueDate });

  await agent.put(`/api/todo/${todo._id}`).send({ status: "completed" }).expect(200);

  const res = await agent.get("/api/todo?q=Standup").expect(200);
  assert.equal(res.body.meta.totalRecords, 2, "one completed, one freshly spawned");

  const spawned = res.body.data.find((t) => t.status === "pending");
  assert.ok(spawned, "a pending occurrence should exist");
  assert.equal(new Date(spawned.dueDate).toISOString(), new Date("2030-03-02T10:00:00.000Z").toISOString());
});

test("a non-recurring todo does not spawn anything", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "One off" });
  await agent.put(`/api/todo/${todo._id}`).send({ status: "completed" }).expect(200);

  assert.equal((await agent.get("/api/todo").expect(200)).body.meta.totalRecords, 1);
});

// ------------------------------------------------------------ stats ----

test("stats reflect only the caller's todos", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);

  await createTodo(alice.agent, { title: "done", status: "completed" });
  await createTodo(alice.agent, { title: "open", priority: "high" });
  await createTodo(alice.agent, { title: "late", dueDate: new Date(Date.now() - 86400000).toISOString() });
  await createTodo(bob.agent, { title: "bob's" });

  const res = await alice.agent.get("/api/stats").expect(200);
  assert.equal(res.body.summary.total, 3);
  assert.equal(res.body.summary.completed, 1);
  assert.equal(res.body.summary.overdue, 1);
  assert.equal(res.body.summary.completionRate, 33);
  // Charts are zero-filled so every series is present.
  assert.equal(res.body.byStatus.length, 3);
  assert.equal(res.body.byPriority.length, 5);
  assert.ok(res.body.completionTrend.length >= 7);
});

test("tags endpoint returns per-user counts, most used first", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "a", tags: ["work", "home"] });
  await createTodo(agent, { title: "b", tags: ["work"] });

  const res = await agent.get("/api/tags").expect(200);
  assert.deepEqual(res.body[0], { name: "work", count: 2 });
  assert.equal(res.body.length, 2);
});

// ---------------------------------------------------------- account ----

test("profile update changes name but ignores role and email", async () => {
  const { agent, user } = await makeUser(app);

  const res = await agent
    .put("/api/user/update")
    .send({ name: "New Name", email: "attacker@example.com", role: "admin" })
    .expect(200);

  assert.equal(res.body.name, "New Name");
  assert.equal(res.body.email, user.email, "email must not be changeable here");
  assert.equal(res.body.role, "user", "role must not be self-assignable");
});

test("preferences round-trip and reject invalid values", async () => {
  const { agent } = await makeUser(app);

  const res = await agent
    .put("/api/user/preferences")
    .send({ theme: "dark", defaultView: "board", pageSize: 25 })
    .expect(200);

  assert.equal(res.body.preferences.theme, "dark");
  assert.equal(res.body.preferences.defaultView, "board");
  assert.equal(res.body.preferences.pageSize, 25);

  assert.equal((await agent.put("/api/user/preferences").send({ defaultView: "spreadsheet" })).status, 400);
  assert.equal((await agent.put("/api/user/preferences").send({ pageSize: 5000 })).status, 400);
});

test("password change requires the current password and takes effect", async () => {
  const { agent, credentials } = await makeUser(app);

  const wrong = await agent
    .put("/api/user/password")
    .send({ currentPassword: "not-it-at-all", newPassword: "brandnewpass" });
  assert.equal(wrong.status, 400);

  await agent
    .put("/api/user/password")
    .send({ currentPassword: credentials.password, newPassword: "brandnewpass" })
    .expect(200);

  const stale = await request(app)
    .post("/api/user/login")
    .send({ email: credentials.email, password: credentials.password });
  assert.equal(stale.status, 400, "the old password must stop working");

  await request(app)
    .post("/api/user/login")
    .send({ email: credentials.email, password: "brandnewpass" })
    .expect(200);
});

test("logout clears the session", async () => {
  const { agent } = await makeUser(app);
  await agent.get("/api/user/me").expect(200);
  await agent.post("/api/user/logout").expect(200);
  assert.equal((await agent.get("/api/user/me")).status, 401);
});
