const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser, createTodo } = require("./helpers");
const { Todo, Project } = require("../models");
const { variant, fieldsFor, flattenVariantData } = require("../config/variants");
const { PdfController } = require("../controller/Pdf.controller");

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

/** An account running as School. */
async function schoolUser() {
  const { agent, user } = await makeUser(app);
  await agent.put("/api/user/preferences").send({ applicationType: "school" }).expect(200);
  return { agent, user };
}

// ------------------------------------------------------------- registry ----

test("School is populated, and names its own PDF template", () => {
  const school = variant("school");
  assert.equal(school.terms.todo.many, "Assignments");
  assert.equal(school.statusLabels.completed, "Submitted");
  assert.equal(school.pdfTemplate, "school");
  assert.deepEqual(school.pdfHighlights, ["score", "maxScore", "weight"]);
  assert.equal(fieldsFor("school", "todo").length, 7);
  assert.equal(fieldsFor("school", "project").length, 4);
});

test("its field definitions become real validation", () => {
  assert.deepEqual(flattenVariantData({ school: { course: "Physics", weight: 20 } }, { variantId: "school" }), {
    "variantData.school.course": "Physics",
    "variantData.school.weight": 20,
  });

  assert.throws(() => flattenVariantData({ school: { assignmentType: "dissertation" } }, { variantId: "school" }), {
    statusCode: 400,
  });
  assert.throws(() => flattenVariantData({ school: { weight: 140 } }, { variantId: "school" }), {
    statusCode: 400,
    message: /^Weight:/,
  });
});

// ---------------------------------------------------------- the write path ----

test("an assignment carries its course, type, weight and marks", async () => {
  const { agent } = await schoolUser();

  const todo = await createTodo(agent, {
    title: "Projectile motion lab",
    variantData: {
      school: {
        course: "Physics",
        gradeLevel: "Year 11",
        assignmentType: "lab",
        weight: 15,
        maxScore: 50,
        submittedAt: "2026-09-28",
      },
    },
  });

  const stored = await Todo.findById(todo._id).lean();
  assert.deepEqual(stored.variantData.school, {
    course: "Physics",
    gradeLevel: "Year 11",
    assignmentType: "lab",
    weight: 15,
    maxScore: 50,
    submittedAt: "2026-09-28",
  });

  // The mark comes back later and joins the rest rather than replacing it.
  await agent.put(`/api/todo/${todo._id}`).send({ variantData: { school: { score: 42 } } }).expect(200);
  const marked = await Todo.findById(todo._id).lean();
  assert.equal(marked.variantData.school.score, 42);
  assert.equal(marked.variantData.school.course, "Physics", "marking must not drop the rest");
});

test("a bad value is a 400 that names the field", async () => {
  const { agent } = await schoolUser();
  const todo = await createTodo(agent, { title: "Essay" });

  const refused = await agent
    .put(`/api/todo/${todo._id}`)
    .send({ variantData: { school: { assignmentType: "dissertation" } } })
    .expect(400);
  assert.match(refused.body.message, /^Assignment type:/);

  await agent.put(`/api/todo/${todo._id}`).send({ variantData: { school: { score: -5 } } }).expect(400);
  await agent.put(`/api/todo/${todo._id}`).send({ variantData: { school: { submittedAt: "whenever" } } }).expect(400);
});

test("a course carries its subject, teacher, term and room", async () => {
  const { agent } = await schoolUser();

  const project = await agent
    .post("/api/project")
    .send({
      name: "Physics",
      variantData: { school: { subject: "Sciences", teacher: "Dr Vance", term: "autumn", room: "L3" } },
    })
    .expect(201)
    .then((response) => response.body);

  const stored = await Project.findById(project._id).lean();
  assert.deepEqual(stored.variantData.school, {
    subject: "Sciences",
    teacher: "Dr Vance",
    term: "autumn",
    room: "L3",
  });

  await agent
    .post("/api/project")
    .send({ name: "History", variantData: { school: { term: "michaelmas" } } })
    .expect(400);
});

test("a General account cannot write School fields, and keeps its own labels", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Plain" });

  await agent.put(`/api/todo/${todo._id}`).send({ variantData: { school: { course: "Physics" } } }).expect(400);
  assert.equal(variant("general").terms.todo.many, "Todos");
});

// ----------------------------------------------------------------- PDF ----

test("a School PDF uses the School template and elevates the marks", async () => {
  const { agent, user } = await schoolUser();

  const project = await agent
    .post("/api/project")
    .send({ name: "Physics", organizationName: "Fairview High" })
    .expect(201)
    .then((response) => response.body);

  const todo = await createTodo(agent, {
    title: "Projectile motion lab",
    projectId: project._id,
    variantData: {
      school: { course: "Physics", assignmentType: "lab", weight: 15, maxScore: 50, score: 42 },
    },
  });

  const payload = await PdfController.payloadFor({
    kind: "todo",
    refId: todo._id,
    userId: user._id,
    user: { ...user, preferences: { applicationType: "school" } },
    version: 1,
  });

  assert.equal(payload.template, "school");

  // The marks are a band, not grid rows - that is what the template reads.
  assert.deepEqual(payload.document.highlights, [
    { label: "Score", value: "42" },
    { label: "Maximum score", value: "50" },
    { label: "Weight", value: "15" },
  ]);

  const labels = payload.document.fields.map((field) => field.label);
  assert.ok(labels.includes("Course"));
  assert.ok(labels.includes("Assignment type"));
  assert.equal(
    payload.document.fields.find((field) => field.label === "Assignment type").value,
    "Lab report",
    "an enum prints its label, not its stored value"
  );
  assert.ok(!labels.includes("Grade level"), "an empty grid field is noise");
  assert.equal(payload.meta.organization, "Fairview High");
});

test("a project's variant decides the template, not the account's", async () => {
  const { agent, user } = await makeUser(app);

  const project = await agent
    .post("/api/project")
    .send({ name: "Evening class", applicationType: "school" })
    .expect(201)
    .then((response) => response.body);

  const todo = await createTodo(agent, { title: "Homework", projectId: project._id });

  const payload = await PdfController.payloadFor({
    kind: "todo",
    refId: todo._id,
    userId: user._id,
    user,
    version: 1,
  });
  assert.equal(payload.template, "school", "a General account filing into a School course gets School");
});

test("a General PDF still has no band and no extra fields", async () => {
  const { agent, user } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Plain" });

  const payload = await PdfController.payloadFor({
    kind: "todo",
    refId: todo._id,
    userId: user._id,
    user,
    version: 1,
  });

  assert.equal(payload.template, "general");
  assert.deepEqual(payload.document.highlights, []);
  assert.deepEqual(
    payload.document.fields.map((field) => field.label),
    ["Status", "Priority", "Due", "Project"]
  );
});
