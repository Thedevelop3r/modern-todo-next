const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser, createTodo } = require("./helpers");
const { Todo } = require("../models");
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

async function kitchen() {
  const { agent, user } = await makeUser(app);
  await agent.put("/api/user/preferences").send({ applicationType: "restaurant" }).expect(200);
  return { agent, user };
}

test("Restaurant is populated and speaks a kitchen's language", () => {
  const restaurant = variant("restaurant");
  assert.equal(restaurant.terms.todo.many, "Prep");
  assert.equal(restaurant.terms.project.many, "Stations");
  assert.equal(restaurant.terms.template.many, "Recipes");
  assert.equal(restaurant.statusLabels.pending, "To prep");
  assert.equal(restaurant.statusLabels.progress, "Prepping");
  assert.equal(restaurant.statusLabels.completed, "Ready");
  assert.equal(restaurant.priorityLabels.urgent, "Service critical");
  assert.equal(restaurant.pdfTemplate, "restaurant");
  assert.equal(fieldsFor("restaurant", "todo").length, 7);
});

test("allergens are a checklist, so they are ticked rather than typed", async () => {
  const { agent } = await kitchen();

  const todo = await createTodo(agent, {
    title: "Brown chicken stock",
    variantData: {
      restaurant: {
        station: "Larder",
        shift: "prep",
        covers: 80,
        supplier: "Fenwick Meats",
        parLevel: 20,
        onHand: 4,
        allergens: [
          { title: "Celery", done: true },
          { title: "Gluten", done: false },
        ],
      },
    },
  });

  const stored = await Todo.findById(todo._id).lean();
  assert.deepEqual(stored.variantData.restaurant.allergens, [
    { title: "Celery", done: true },
    { title: "Gluten", done: false },
  ]);
  assert.equal(stored.variantData.restaurant.covers, 80);

  await agent.put(`/api/todo/${todo._id}`).send({ variantData: { restaurant: { shift: "brunch" } } }).expect(400);
});

test("a prep sheet bands the station, shift and covers", async () => {
  const { agent, user } = await kitchen();
  const todo = await createTodo(agent, {
    title: "Brown chicken stock",
    variantData: { restaurant: { station: "Larder", shift: "dinner", covers: 80, allergens: [{ title: "Celery", done: true }] } },
  });

  const payload = await PdfController.payloadFor({
    kind: "todo",
    refId: todo._id,
    userId: user._id,
    user: { ...user, preferences: { applicationType: "restaurant" } },
    version: 1,
  });

  assert.equal(payload.template, "restaurant");
  assert.deepEqual(payload.document.highlights, [
    { label: "Station", value: "Larder" },
    { label: "Shift", value: "Dinner" },
    { label: "Covers", value: "80" },
  ]);
  assert.equal(
    payload.document.fields.find((field) => field.label === "Allergens").value,
    "1 of 1 done",
    "a checklist prints as a tally"
  );
});

test("a station's PDF carries the order sheet its prep generates", async () => {
  const { agent, user } = await kitchen();

  const project = await agent
    .post("/api/project")
    .send({ name: "Larder", organizationName: "The Fat Duckling" })
    .expect(201)
    .then((response) => response.body);

  // Below par by 16, below par by 2, and one that is fine.
  await createTodo(agent, {
    title: "Brown chicken stock",
    projectId: project._id,
    variantData: { restaurant: { supplier: "Fenwick Meats", parLevel: 20, onHand: 4 } },
  });
  await createTodo(agent, {
    title: "Pickled shallots",
    projectId: project._id,
    variantData: { restaurant: { supplier: "Green Row", parLevel: 6, onHand: 4 } },
  });
  await createTodo(agent, {
    title: "Clarified butter",
    projectId: project._id,
    variantData: { restaurant: { supplier: "Fenwick Meats", parLevel: 5, onHand: 9 } },
  });
  // No par level at all: an ordinary task, not stock.
  await createTodo(agent, { title: "Deep clean the pass", projectId: project._id });

  const payload = await PdfController.payloadFor({
    kind: "project",
    refId: project._id,
    userId: user._id,
    user: { ...user, preferences: { applicationType: "restaurant" } },
    version: 1,
  });

  assert.deepEqual(payload.document.secondaryHeadings, ["Item", "Supplier", "On hand / par", "Order"]);
  assert.deepEqual(
    payload.document.secondary.map((line) => [line.title, line.status, line.priority, line.due]),
    [
      ["Brown chicken stock", "Fenwick Meats", "4 / 20", "16"],
      ["Pickled shallots", "Green Row", "4 / 6", "2"],
    ],
    "worst shortfall first, and only what is actually short"
  );

  // The prep list is still there; the order sheet is a second table, not a swap.
  assert.equal(payload.document.items.length, 4);
  // And it speaks the kitchen's vocabulary, not a generic one.
  assert.equal(payload.document.items[0].status, "To prep");
  assert.equal(payload.document.fields[0].label, "Prep");
});

test("a missing count is nothing on hand, which is the point of an order sheet", async () => {
  const { agent, user } = await kitchen();
  const project = await agent.post("/api/project").send({ name: "Larder" }).expect(201).then((r) => r.body);

  await createTodo(agent, {
    title: "Veal jus",
    projectId: project._id,
    variantData: { restaurant: { supplier: "Fenwick Meats", parLevel: 10 } },
  });

  const payload = await PdfController.payloadFor({
    kind: "project",
    refId: project._id,
    userId: user._id,
    user: { ...user, preferences: { applicationType: "restaurant" } },
    version: 1,
  });

  assert.deepEqual(payload.document.secondary[0].priority, "0 / 10");
  assert.equal(payload.document.secondary[0].due, "10");
});

test("other variants get no order sheet at all", async () => {
  const { agent, user } = await makeUser(app);
  const project = await agent.post("/api/project").send({ name: "Plain" }).expect(201).then((r) => r.body);
  await createTodo(agent, { title: "A todo", projectId: project._id });

  const payload = await PdfController.payloadFor({
    kind: "project",
    refId: project._id,
    userId: user._id,
    user,
    version: 1,
  });

  assert.deepEqual(payload.document.secondary, []);
  assert.deepEqual(payload.document.secondaryHeadings, []);
});

test("all five variants are now populated and internally consistent", () => {
  for (const id of ["general", "school", "law-enforcement", "hospital", "restaurant"]) {
    const entry = variant(id);
    assert.equal(entry.id, id);
    assert.ok(entry.pdfTemplate, `${id} names no template`);
    for (const key of ["todo", "project", "template", "tag"]) {
      assert.ok(entry.terms[key]?.one && entry.terms[key]?.many, `${id} is missing a ${key} term`);
    }
    for (const page of entry.pages || []) {
      assert.ok(["group", "scoreboard", "files", "stock"].includes(page.kind), `${id}.${page.id} has kind ${page.kind}`);
      assert.ok(page.groupBy, `${id}.${page.id} groups by nothing`);
    }
    for (const key of entry.pdfHighlights || []) {
      assert.ok(
        fieldsFor(id, "todo").some((field) => field.key === key),
        `${id} elevates ${key}, which is not one of its fields`
      );
    }
    if (entry.pdfBannerField) {
      assert.ok(
        fieldsFor(id, "todo").some((field) => field.key === entry.pdfBannerField),
        `${id} banners a field it does not declare`
      );
    }
  }
});
