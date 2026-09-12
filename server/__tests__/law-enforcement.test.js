const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser, createTodo } = require("./helpers");
const { Todo, Activity } = require("../models");
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

/** A minimal but genuinely %PDF--headed document, as an exhibit. */
const exhibit = (padding = 200) =>
  Buffer.concat([Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"), Buffer.alloc(padding, 0x20), Buffer.from("\n%%EOF\n")]);

const upload = (agent, buffer, name, fields = {}) => {
  const request = agent.post("/api/files");
  Object.entries(fields).forEach(([key, value]) => request.field(key, String(value)));
  return request.attach("file", buffer, name);
};

async function officer() {
  const { agent, user } = await makeUser(app);
  await agent.put("/api/user/preferences").send({ applicationType: "law-enforcement" }).expect(200);
  return { agent, user };
}

// ------------------------------------------------------------- registry ----

test("Law Enforcement is populated and names its own template and banner", () => {
  const force = variant("law-enforcement");
  assert.equal(force.terms.todo.many, "Cases");
  assert.equal(force.terms.project.one, "Operation");
  assert.equal(force.statusLabels.completed, "Closed");
  assert.equal(force.priorityLabels.urgent, "Critical");
  assert.equal(force.pdfTemplate, "law-enforcement");
  assert.equal(force.pdfBannerField, "confidentiality");
  assert.ok(force.capabilities.includes("custody"));
  assert.equal(fieldsFor("law-enforcement", "todo").length, 7);
});

test("its classifications and handling levels are closed sets", () => {
  assert.deepEqual(
    flattenVariantData(
      { "law-enforcement": { caseNumber: "2026-004821", classification: "fraud", confidentiality: "sensitive" } },
      { variantId: "law-enforcement" }
    ),
    {
      "variantData.law-enforcement.caseNumber": "2026-004821",
      "variantData.law-enforcement.classification": "fraud",
      "variantData.law-enforcement.confidentiality": "sensitive",
    }
  );

  assert.throws(
    () => flattenVariantData({ "law-enforcement": { confidentiality: "eyes-only" } }, { variantId: "law-enforcement" }),
    { statusCode: 400, message: /^Handling:/ }
  );
});

test("a case carries its number, unit, officer and incident time", async () => {
  const { agent } = await officer();

  const todo = await createTodo(agent, {
    title: "Burglary, Elm Street",
    variantData: {
      "law-enforcement": {
        caseNumber: "2026-004821",
        classification: "theft",
        confidentiality: "official",
        unit: "CID",
        badge: "4471",
        location: "14 Elm Street",
        incidentTime: "2026-09-04",
      },
    },
  });

  const stored = await Todo.findById(todo._id).lean();
  assert.equal(stored.variantData["law-enforcement"].caseNumber, "2026-004821");
  assert.equal(stored.variantData["law-enforcement"].badge, "4471");
});

// ------------------------------------------------- the chain of custody ----

test("storing a file records what was stored, how big and under which checksum", async () => {
  const { agent } = await officer();
  const todo = await createTodo(agent, { title: "Burglary" });

  const uploaded = await upload(agent, exhibit(), "doorcam.pdf", { scopeKind: "todo", scopeId: todo._id }).expect(201);
  const file = uploaded.body.file;

  const trail = await agent.get(`/api/files/${file._id}/activity`).expect(200);
  assert.equal(trail.body.length, 1);

  const [entry] = trail.body;
  assert.equal(entry.action, "file.stored");
  assert.equal(entry.meta.filename, file.filename);
  assert.equal(entry.meta.checksum, file.checksum);
  assert.equal(entry.meta.sizeBytes, file.storedSize);
  assert.equal(entry.meta.scopeKind, "todo");
  // It is also on the case's own timeline, where an officer would look first.
  const todoTrail = await agent.get(`/api/todo/${todo._id}/activity`).expect(200);
  assert.ok(todoTrail.body.some((row) => row.action === "file.stored"));
});

test("the trail outlives the file, because a deletion is the entry that matters", async () => {
  const { agent } = await officer();
  const todo = await createTodo(agent, { title: "Burglary" });

  const file = (await upload(agent, exhibit(), "doorcam.pdf", { scopeKind: "todo", scopeId: todo._id }).expect(201))
    .body.file;

  await agent.delete(`/api/files/${file._id}`).expect(200);

  // The file is gone, so the file-scoped endpoint 404s - the trail is not.
  await agent.get(`/api/files/${file._id}/activity`).expect(404);

  const kept = await Activity.find({ "meta.fileId": String(file._id) }).sort({ createdAt: 1 }).lean();
  assert.deepEqual(
    kept.map((entry) => entry.action),
    ["file.stored", "file.deleted"]
  );
  assert.equal(kept[1].meta.checksum, file.checksum, "the deleted exhibit's checksum is still on record");
});

test("one account's custody trail is invisible to another", async () => {
  const { agent } = await officer();
  const { agent: stranger } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Burglary" });

  const file = (await upload(agent, exhibit(), "doorcam.pdf", { scopeKind: "todo", scopeId: todo._id }).expect(201))
    .body.file;

  await stranger.get(`/api/files/${file._id}/activity`).expect(404);
});

// ----------------------------------------------------------------- PDF ----

test("a case PDF carries the handling banner and an evidence manifest", async () => {
  const { agent, user } = await officer();
  const todo = await createTodo(agent, {
    title: "Burglary, Elm Street",
    variantData: {
      "law-enforcement": {
        caseNumber: "2026-004821",
        classification: "theft",
        confidentiality: "sensitive",
        unit: "CID",
        incidentTime: "2026-09-04",
      },
    },
  });

  await upload(agent, exhibit(), "doorcam.pdf", { scopeKind: "todo", scopeId: todo._id }).expect(201);
  await upload(agent, exhibit(400), "statement.pdf", { scopeKind: "todo", scopeId: todo._id }).expect(201);

  const payload = await PdfController.payloadFor({
    kind: "todo",
    refId: todo._id,
    userId: user._id,
    user: { ...user, preferences: { applicationType: "law-enforcement" } },
    version: 1,
  });

  assert.equal(payload.template, "law-enforcement");
  assert.equal(payload.document.banner, "Official — Sensitive", "the banner prints the option's label");

  // The banner is not repeated in the grid.
  const labels = payload.document.fields.map((field) => field.label);
  assert.ok(!labels.includes("Handling"));
  assert.ok(labels.includes("Unit"));

  assert.deepEqual(
    payload.document.highlights.map((entry) => entry.label),
    ["Case number", "Classification", "Incident"],
    "the band prints in the order the registry lists"
  );
  assert.equal(payload.document.highlights[0].value, "2026-004821");
  assert.equal(payload.document.highlights[1].value, "Theft", "an enum prints its label");
  // The month's abbreviation is the runtime's business ("Sep" or "Sept"), the
  // shape is ours.
  assert.match(payload.document.highlights[2].value, /^04 Sept? 2026$/);

  assert.deepEqual(payload.document.itemHeadings, ["Exhibit", "Type", "Size", "Checksum"]);
  assert.equal(payload.document.items.length, 2);
  const [first] = payload.document.items;
  assert.equal(first.title, "doorcam.pdf");
  assert.equal(first.status, "document", "the Type column is the file's kind");
  assert.match(first.priority, /B$/);
  assert.match(first.due, /^[0-9a-f]{12}$/, "a manifest row carries a checkable checksum");
});

test("a generated PDF never lists itself as evidence", async () => {
  const { agent, user } = await officer();
  const todo = await createTodo(agent, { title: "Burglary" });
  await upload(agent, exhibit(), "doorcam.pdf", { scopeKind: "todo", scopeId: todo._id }).expect(201);

  // A previous version of this very document is a generated file in the same
  // scope; it is not an exhibit and must not appear in the manifest.
  const { StoredFile } = require("../models");
  await StoredFile.create({
    ownerId: user._id,
    scope: { kind: "todo", refId: todo._id },
    kind: "pdf",
    source: "generated",
    filename: "CASE-v01.pdf",
    mime: "application/pdf",
    originalSize: 10,
    storedSize: 10,
    state: "ready",
  });

  const payload = await PdfController.payloadFor({
    kind: "todo",
    refId: todo._id,
    userId: user._id,
    user: { ...user, preferences: { applicationType: "law-enforcement" } },
    version: 2,
  });

  assert.deepEqual(
    payload.document.items.map((item) => item.title),
    ["doorcam.pdf"]
  );
});

test("other variants get no banner and no manifest", async () => {
  const { agent, user } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Plain" });
  await upload(agent, exhibit(), "note.pdf", { scopeKind: "todo", scopeId: todo._id }).expect(201);

  const payload = await PdfController.payloadFor({
    kind: "todo",
    refId: todo._id,
    userId: user._id,
    user,
    version: 1,
  });

  assert.equal(payload.document.banner, "");
  assert.deepEqual(payload.document.items, [], "a manifest is printed only where the variant asks for one");
});
