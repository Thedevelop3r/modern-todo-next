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

async function ward() {
  const { agent, user } = await makeUser(app);
  await agent.put("/api/user/preferences").send({ applicationType: "hospital" }).expect(200);
  return { agent, user };
}

test("Hospital is populated and speaks a ward's language", () => {
  const hospital = variant("hospital");
  assert.equal(hospital.terms.project.many, "Wards");
  assert.equal(hospital.terms.template.many, "Protocols");
  assert.equal(hospital.priorityLabels.urgent, "Immediate");
  assert.equal(hospital.pdfTemplate, "hospital");
  assert.equal(fieldsFor("hospital", "todo").length, 7);
});

/**
 * The deliberate constraint from the plan, pinned by a test: this app is a task
 * manager, not a medical record, and it says so where the work is done.
 */
test("it carries a standing notice saying what it is not", () => {
  const notice = variant("hospital").notice;
  assert.ok(notice, "Hospital must declare a notice");
  assert.match(notice.body, /not an EHR/i);
  assert.match(notice.body, /not a medical device/i);
  assert.match(notice.body, /patient reference/i);
  // The app has no audit trail on file reads. That is a scoped decision, and
  // the people using it are told rather than left to assume otherwise.
  assert.match(notice.body, /reads are not audited/i);

  // No other populated variant declares one, so nothing else is affected.
  assert.equal(variant("general").notice, undefined);
  assert.equal(variant("school").notice, undefined);
});

test("a patient reference is a reference; there is nowhere to put a name", () => {
  const keys = fieldsFor("hospital", "todo").map((field) => field.key);
  assert.ok(keys.includes("patientRef"));
  assert.ok(
    !keys.some((key) => /name|dob|nhs|diagnos/i.test(key)),
    "the registry must not offer a place for identifiers it should not hold"
  );

  const reference = fieldsFor("hospital", "todo").find((field) => field.key === "patientRef");
  assert.match(reference.hint, /never a name/i);
});

test("a ward task carries its reference, bed, triage and window", async () => {
  const { agent } = await ward();

  const todo = await createTodo(agent, {
    title: "Four-hourly observations",
    variantData: {
      hospital: {
        patientRef: "MRN-88421",
        ward: "B4",
        bed: "12",
        triage: "urgent",
        careType: "observation",
        dueWindow: "this-shift",
        confidentialityNote: "confidential",
      },
    },
  });

  const stored = await Todo.findById(todo._id).lean();
  assert.equal(stored.variantData.hospital.patientRef, "MRN-88421");
  assert.equal(stored.variantData.hospital.triage, "urgent");

  await agent.put(`/api/todo/${todo._id}`).send({ variantData: { hospital: { triage: "critical" } } }).expect(400);
});

test("a handover PDF banners its handling and prints the notice", async () => {
  const { agent, user } = await ward();
  const todo = await createTodo(agent, {
    title: "Four-hourly observations",
    variantData: {
      hospital: {
        patientRef: "MRN-88421",
        ward: "B4",
        triage: "urgent",
        dueWindow: "this-shift",
        confidentialityNote: "confidential",
      },
    },
  });

  const payload = await PdfController.payloadFor({
    kind: "todo",
    refId: todo._id,
    userId: user._id,
    user: { ...user, preferences: { applicationType: "hospital" } },
    version: 1,
  });

  assert.equal(payload.template, "hospital");
  assert.equal(payload.document.banner, "Confidential — patient identifiable");
  assert.match(payload.document.notice, /not an EHR/i);

  assert.deepEqual(payload.document.highlights, [
    { label: "Patient reference", value: "MRN-88421" },
    { label: "Triage", value: "Urgent" },
    { label: "Due window", value: "This shift" },
  ]);

  // Hospital asks for no manifest, so attachments are not listed.
  assert.deepEqual(payload.document.items, []);
});

test("a variant with no notice prints none", async () => {
  const { agent, user } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Plain" });

  const payload = await PdfController.payloadFor({
    kind: "todo",
    refId: todo._id,
    userId: user._id,
    user,
    version: 1,
  });
  assert.equal(payload.document.notice, "");
});
