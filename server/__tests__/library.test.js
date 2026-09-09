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

// ------------------------------------------------------ saved views ----

test("saved views round-trip and stay per user", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);

  const created = await alice.agent
    .post("/api/view")
    .send({ name: "Overdue work", query: { due: "overdue", status: ["pending"] }, pinned: true })
    .expect(201);

  assert.equal(created.body.name, "Overdue work");
  assert.deepEqual(created.body.query, { due: "overdue", status: ["pending"] });
  assert.equal(created.body.pinned, true);

  assert.equal((await alice.agent.get("/api/view").expect(200)).body.length, 1);
  assert.equal((await bob.agent.get("/api/view").expect(200)).body.length, 0);

  assert.equal((await bob.agent.put(`/api/view/${created.body._id}`).send({ name: "x" })).status, 404);
  assert.equal((await bob.agent.delete(`/api/view/${created.body._id}`)).status, 404);
});

test("a saved view can be renamed and deleted", async () => {
  const { agent } = await makeUser(app);
  const view = await agent.post("/api/view").send({ name: "Temp", query: {} }).expect(201);

  const renamed = await agent.put(`/api/view/${view.body._id}`).send({ name: "Renamed" }).expect(200);
  assert.equal(renamed.body.name, "Renamed");

  await agent.delete(`/api/view/${view.body._id}`).expect(200);
  assert.equal((await agent.get("/api/view").expect(200)).body.length, 0);
});

test("a saved view requires a name", async () => {
  const { agent } = await makeUser(app);
  assert.equal((await agent.post("/api/view").send({ name: "  ", query: {} })).status, 400);
});

// -------------------------------------------------------- templates ----

test("a template can be created and instantiated as a todo", async () => {
  const { agent } = await makeUser(app);

  const template = await agent
    .post("/api/template")
    .send({
      name: "Standup",
      title: "Daily standup",
      description: "15 minutes",
      priority: "medium",
      tags: ["work"],
      subtasks: [{ title: "yesterday" }, { title: "today" }],
      dueInDays: 1,
    })
    .expect(201);

  const todo = await agent.post(`/api/template/${template.body._id}/use`).expect(201);
  assert.equal(todo.body.title, "Daily standup");
  assert.equal(todo.body.priority, "medium");
  assert.deepEqual(todo.body.tags, ["work"]);
  assert.equal(todo.body.subtasks.length, 2);
  assert.equal(todo.body.subtasks[0].done, false);
  assert.ok(todo.body.dueDate, "dueInDays resolves to a real date");

  // Using a template counts the use.
  const list = await agent.get("/api/template").expect(200);
  assert.equal(list.body[0].useCount, 1);
});

test("dueInDays of null leaves the todo undated", async () => {
  const { agent } = await makeUser(app);
  const template = await agent.post("/api/template").send({ name: "n", title: "No date" }).expect(201);

  const todo = await agent.post(`/api/template/${template.body._id}/use`).expect(201);
  assert.equal(todo.body.dueDate, null);
});

test("a template can be captured from an existing todo, resetting progress", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, {
    title: "Release checklist",
    status: "completed",
    tags: ["release"],
    subtasks: [{ title: "tag it", done: true }],
  });

  const template = await agent
    .post("/api/template/from-todo")
    .send({ todoId: todo._id, name: "Release" })
    .expect(201);

  assert.equal(template.body.name, "Release");
  assert.equal(template.body.title, "Release checklist");
  assert.equal(template.body.subtasks[0].done, false, "subtasks reset");
});

test("templates are per user", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const template = await alice.agent.post("/api/template").send({ name: "t", title: "T" }).expect(201);

  assert.equal((await bob.agent.get("/api/template").expect(200)).body.length, 0);
  assert.equal((await bob.agent.post(`/api/template/${template.body._id}/use`)).status, 404);
  assert.equal((await bob.agent.delete(`/api/template/${template.body._id}`)).status, 404);
});

test("capturing a template from another user's todo is refused", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const todo = await createTodo(alice.agent);

  assert.equal((await bob.agent.post("/api/template/from-todo").send({ todoId: todo._id })).status, 404);
});

// ------------------------------------------------- tag maintenance ----

test("renaming a tag rewrites it across every todo", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "a", tags: ["work", "urgent"] });
  await createTodo(agent, { title: "b", tags: ["work"] });
  await createTodo(agent, { title: "c", tags: ["home"] });

  const result = await agent.put("/api/tags/rename").send({ from: "work", to: "office" }).expect(200);
  assert.equal(result.body.modified, 2);

  assert.equal((await agent.get("/api/todo?tags=office").expect(200)).body.meta.totalRecords, 2);
  assert.equal((await agent.get("/api/todo?tags=work").expect(200)).body.meta.totalRecords, 0);
  assert.equal((await agent.get("/api/todo?tags=home").expect(200)).body.meta.totalRecords, 1);
});

test("renaming onto an existing tag does not duplicate it", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "both", tags: ["work", "office"] });

  await agent.put("/api/tags/rename").send({ from: "work", to: "office" }).expect(200);

  const todos = await agent.get("/api/todo").expect(200);
  const tags = todos.body.data[0].tags;
  assert.deepEqual(tags, ["office"], "the tag appears exactly once");
});

test("merging folds several tags into one", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "a", tags: ["bug"] });
  await createTodo(agent, { title: "b", tags: ["defect"] });
  await createTodo(agent, { title: "c", tags: ["issue", "keep"] });

  const result = await agent
    .put("/api/tags/merge")
    .send({ sources: ["bug", "defect", "issue"], target: "bug" })
    .expect(200);
  assert.equal(result.body.modified, 3);

  assert.equal((await agent.get("/api/todo?tags=bug").expect(200)).body.meta.totalRecords, 3);
  // An unrelated tag on the same todo survives the merge.
  assert.equal((await agent.get("/api/todo?tags=keep").expect(200)).body.meta.totalRecords, 1);
});

test("deleting a tag removes it everywhere but keeps the todos", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "a", tags: ["scrap", "keep"] });

  const result = await agent.delete("/api/tags/scrap").expect(200);
  assert.equal(result.body.modified, 1);

  const todos = await agent.get("/api/todo").expect(200);
  assert.equal(todos.body.meta.totalRecords, 1, "the todo survives");
  assert.deepEqual(todos.body.data[0].tags, ["keep"]);
});

test("tag maintenance never touches another user's todos", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  await createTodo(alice.agent, { title: "mine", tags: ["shared"] });
  await createTodo(bob.agent, { title: "theirs", tags: ["shared"] });

  await alice.agent.put("/api/tags/rename").send({ from: "shared", to: "renamed" }).expect(200);

  const bobTodos = await bob.agent.get("/api/todo?tags=shared").expect(200);
  assert.equal(bobTodos.body.meta.totalRecords, 1, "the other user's tag is untouched");
});

test("the tags endpoint reflects maintenance immediately", async () => {
  const { agent } = await makeUser(app);
  await createTodo(agent, { title: "a", tags: ["old"] });

  await agent.put("/api/tags/rename").send({ from: "old", to: "new" }).expect(200);

  const tags = await agent.get("/api/tags").expect(200);
  assert.deepEqual(tags.body.map((t) => t.name), ["new"]);
});
