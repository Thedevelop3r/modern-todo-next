const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser, createTodo } = require("./helpers");
const { Todo, Project, Template } = require("../models");
const {
  VARIANTS,
  VARIANT_IDS,
  DEFAULT_VARIANT,
  variant,
  fieldsFor,
  flattenVariantData,
  nestVariantData,
  resolveVariant,
} = require("../config/variants");

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

// ------------------------------------------------------------- registry ----

test("all five variants load and General is the default", () => {
  assert.deepEqual(VARIANT_IDS, ["general", "school", "law-enforcement", "hospital", "restaurant"]);
  assert.equal(DEFAULT_VARIANT, "general");
  assert.equal(variant("school").label, "School");
  // An unknown id falls back rather than throwing - a stored preference from a
  // build that knew more variants must not take the API down.
  assert.equal(variant("does-not-exist").id, "general");
});

test("General adds no fields, so existing accounts see no change", () => {
  assert.deepEqual(fieldsFor("general", "todo"), []);
  assert.deepEqual(fieldsFor("general", "project"), []);
});

test("a project's variant wins over the account's", () => {
  const user = { preferences: { applicationType: "school" } };
  assert.equal(resolveVariant({ user, project: { applicationType: "hospital" } }), "hospital");
  assert.equal(resolveVariant({ user, project: { applicationType: null } }), "school");
  assert.equal(resolveVariant({ user: {} }), "general");
});

// --------------------------------------------------------- the write path ----

test("variant data is flattened to dot paths, never to a nested object", () => {
  // The shape matters more than the values: a nested assignment is both what
  // drops the other variants' data and the form Mongoose will not persist.
  const update = flattenVariantData({ general: {} }, { variantId: "general" });
  assert.deepEqual(update, {}, "nothing to write is an empty patch, not a nested empty object");

  for (const key of Object.keys(update)) {
    assert.match(key, /^variantData\./);
  }
});

test("a payload for another variant, or for no variant at all, is a 400", () => {
  assert.throws(() => flattenVariantData({ nope: { x: 1 } }, { variantId: "general" }), {
    statusCode: 400,
    message: /Unknown variant/,
  });
  assert.throws(() => flattenVariantData({ school: { x: 1 } }, { variantId: "general" }), {
    statusCode: 400,
    message: /Cannot write school fields while using general/,
  });
  // The same rules apply to the insert form.
  assert.throws(() => nestVariantData({ hospital: { x: 1 } }, { variantId: "general" }), { statusCode: 400 });
});

test("unknown keys inside the active variant are dropped, not rejected", async () => {
  const { agent } = await makeUser(app);
  // A form that still sends a field the registry has removed keeps working.
  const todo = await createTodo(agent, { title: "Tolerant", variantData: { general: { gone: "value" } } });

  const stored = await Todo.findById(todo._id).lean();
  // Mongoose minimizes an empty object away, so "nothing was written" reads as
  // an absent path rather than an empty one.
  assert.equal(stored.variantData, undefined, "a stripped field writes nothing at all");
});

/**
 * The invariant the whole design rests on: dot paths are additive, a whole
 * object assignment is not. No variant declares fields yet, so this is asserted
 * against the database directly - it is a property of the write form, not of
 * any one variant's schema.
 */
test("dot paths are additive across variants; a nested assign is not", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Additive" });

  await Todo.updateOne({ _id: todo._id }, { $set: { "variantData.school.course": "Physics" } });
  await Todo.updateOne({ _id: todo._id }, { $set: { "variantData.hospital.ward": "B4" } });

  const both = await Todo.findById(todo._id).lean();
  assert.deepEqual(both.variantData, { school: { course: "Physics" }, hospital: { ward: "B4" } });

  // A second field on one variant joins it rather than replacing the sub-object.
  await Todo.updateOne({ _id: todo._id }, { $set: { "variantData.school.term": "Autumn" } });
  const grown = await Todo.findById(todo._id).lean();
  assert.deepEqual(grown.variantData.school, { course: "Physics", term: "Autumn" });

  // And the form the write path deliberately never uses.
  await Todo.updateOne({ _id: todo._id }, { $set: { variantData: { school: { course: "Physics" } } } });
  const clobbered = await Todo.findById(todo._id).lean();
  assert.equal(clobbered.variantData.hospital, undefined, "this is exactly what dot paths prevent");
});

/**
 * Field validation, exercised against a variant populated for the duration of
 * this test.
 *
 * No variant declares fields until its own batch, but the machinery that turns
 * a field definition into a schema - and a bad value into a 400 rather than a
 * 500 - exists now and is what every later batch depends on.
 */
test("a field definition becomes real validation, and a bad value is a 400", async (t) => {
  const school = VARIANTS.school;
  const original = school.todoFields;
  school.todoFields = [
    { key: "course", label: "Course", type: "string", max: 8 },
    { key: "term", label: "Term", type: "enum", options: [{ value: "autumn", label: "Autumn" }] },
    { key: "weighting", label: "Weighting", type: "number", min: 0, max: 100 },
    { key: "submitted", label: "Submitted", type: "boolean" },
    { key: "due", label: "Due", type: "date" },
    { key: "steps", label: "Steps", type: "checklist" },
  ];
  t.after(() => {
    school.todoFields = original;
  });

  const { agent } = await makeUser(app);
  await agent.put("/api/user/preferences").send({ applicationType: "school" }).expect(200);

  const todo = await createTodo(agent, {
    title: "Essay",
    variantData: {
      school: {
        course: "Physics",
        term: "autumn",
        weighting: 40,
        submitted: false,
        due: "2026-10-01",
        steps: [{ title: "Draft", done: true }],
      },
    },
  });

  const stored = await Todo.findById(todo._id).lean();
  assert.deepEqual(stored.variantData.school, {
    course: "Physics",
    term: "autumn",
    weighting: 40,
    submitted: false,
    due: "2026-10-01",
    steps: [{ title: "Draft", done: true }],
  });

  // Each of these is the field definition doing the rejecting, not a model.
  await agent.put(`/api/todo/${todo._id}`).send({ variantData: { school: { term: "summer" } } }).expect(400);
  await agent.put(`/api/todo/${todo._id}`).send({ variantData: { school: { weighting: 900 } } }).expect(400);
  await agent.put(`/api/todo/${todo._id}`).send({ variantData: { school: { due: "not a date" } } }).expect(400);

  const refused = await agent
    .put(`/api/todo/${todo._id}`)
    .send({ variantData: { school: { course: "far too long a course name" } } })
    .expect(400);
  assert.match(refused.body.message, /^Course:/, "the message names the field, not the key");

  // One field updated leaves the rest of the sub-object alone.
  await agent.put(`/api/todo/${todo._id}`).send({ variantData: { school: { submitted: true } } }).expect(200);
  const after = await Todo.findById(todo._id).lean();
  assert.equal(after.variantData.school.course, "Physics");
  assert.equal(after.variantData.school.submitted, true);

  // And another variant's data cannot be written while School is in force.
  await agent.put(`/api/todo/${todo._id}`).send({ variantData: { hospital: { ward: "B4" } } }).expect(400);
});

test("switching the account's variant writes nothing to any record", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Untouched" });
  await Todo.updateOne({ _id: todo._id }, { $set: { "variantData.school.course": "Physics" } });

  const before = await Todo.findById(todo._id).lean();

  await agent.put("/api/user/preferences").send({ applicationType: "hospital" }).expect(200);
  await agent.put("/api/user/preferences").send({ applicationType: "general" }).expect(200);

  const after = await Todo.findById(todo._id).lean();
  assert.deepEqual(after.variantData, before.variantData, "switching hides fields; it never deletes them");
  assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
});

// ------------------------------------------------------------ the API ----

test("the account's application type is a validated preference", async () => {
  const { agent } = await makeUser(app);

  const me = await agent.get("/api/user/me").expect(200);
  assert.equal(me.body.preferences.applicationType, "general", "existing accounts default to General");

  const saved = await agent.put("/api/user/preferences").send({ applicationType: "school" }).expect(200);
  assert.equal(saved.body.preferences.applicationType, "school");

  await agent.put("/api/user/preferences").send({ applicationType: "accounting" }).expect(400);
});

test("a project can override the account's type, and null means inherit", async () => {
  const { agent } = await makeUser(app);
  await agent.put("/api/user/preferences").send({ applicationType: "school" }).expect(200);

  const project = await agent
    .post("/api/project")
    .send({ name: "Ward round", applicationType: "hospital" })
    .expect(201)
    .then((response) => response.body);
  assert.equal(project.applicationType, "hospital");

  const inheriting = await agent
    .post("/api/project")
    .send({ name: "Homework", applicationType: null })
    .expect(201)
    .then((response) => response.body);
  assert.equal(inheriting.applicationType, null);

  await agent.post("/api/project").send({ name: "Nope", applicationType: "accounting" }).expect(400);

  const stored = await Project.findById(project._id).lean();
  assert.equal(resolveVariant({ project: stored, user: { preferences: { applicationType: "school" } } }), "hospital");
});

test("a todo carrying variant data survives the trip through a template", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Seeded" });
  await Todo.updateOne({ _id: todo._id }, { $set: { "variantData.school.course": "Physics" } });

  const template = await agent
    .post("/api/template/from-todo")
    .send({ todoId: todo._id, name: "Lesson" })
    .expect(201)
    .then((response) => response.body);

  const storedTemplate = await Template.findById(template._id).lean();
  assert.deepEqual(storedTemplate.variantData, { school: { course: "Physics" } });

  const spawned = await agent.post(`/api/template/${template._id}/use`).expect(201).then((r) => r.body);
  const storedTodo = await Todo.findById(spawned._id).lean();
  assert.deepEqual(storedTodo.variantData, { school: { course: "Physics" } }, "a template without its fields is worth little");
});

test("a todo with no variant data is written exactly as before", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Plain" });

  const stored = await Todo.findById(todo._id).lean();
  assert.equal(stored.variantData, undefined, "no extras means no path, not an empty one");

  await agent.put(`/api/todo/${todo._id}`).send({ title: "Still plain" }).expect(200);
  assert.equal((await Todo.findById(todo._id).lean()).variantData, undefined);
});
