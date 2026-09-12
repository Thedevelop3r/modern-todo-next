const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser, createTodo } = require("./helpers");
const { Todo } = require("../models");
const { sanitizeRich, sanitizeInline, htmlToText, isEmptyHtml, textToHtml } = require("../utils/sanitize");
const { applyRichText } = require("../utils/rich-fields");

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

// ----------------------------------------------------------- sanitizer ----

test("script, handlers and framed content never survive", () => {
  const attacks = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<p onclick=\"steal()\">text</p>",
    "<iframe src=\"//evil.example\"></iframe>",
    "<object data=\"evil.swf\"></object>",
    "<embed src=\"evil\">",
    "<svg/onload=alert(1)>",
    "<style>body{display:none}</style>",
    "<form action=\"//evil\"><input name=\"p\"></form>",
  ];

  for (const attack of attacks) {
    const clean = sanitizeRich(attack);
    assert.doesNotMatch(clean, /<script|<iframe|<object|<embed|<svg|<style|<form|<input/i, attack);
    assert.doesNotMatch(clean, /on\w+\s*=/i, `an event handler survived: ${attack}`);
  }
});

test("javascript: and data: urls are dropped but real links survive", () => {
  assert.doesNotMatch(sanitizeRich('<a href="javascript:alert(1)">x</a>'), /javascript:/i);
  assert.doesNotMatch(sanitizeRich('<a href="data:text/html,<script>alert(1)</script>">x</a>'), /data:/i);
  assert.doesNotMatch(sanitizeRich('<a href="//evil.example">x</a>'), /href="\/\//);

  const link = sanitizeRich('<a href="https://example.com">x</a>');
  assert.match(link, /href="https:\/\/example\.com"/);
  assert.match(link, /rel="noopener noreferrer nofollow"/, "outbound links never leak the opener");
});

test("only the styles the toolbar produces are kept, and only with sane values", () => {
  const kept = sanitizeRich('<p style="color:#ff0000;font-size:14px;text-align:center">x</p>');
  assert.match(kept, /color:#ff0000/);
  assert.match(kept, /font-size:14px/);
  assert.match(kept, /text-align:center/);

  // Anything that could reach out of the document, or off the page.
  for (const bad of [
    '<p style="background:url(javascript:alert(1))">x</p>',
    '<p style="position:fixed;top:0;left:0;width:100vw">x</p>',
    '<p style="font-size:9999px">x</p>',
    '<p style="behavior:url(evil.htc)">x</p>',
  ]) {
    const clean = sanitizeRich(bad);
    assert.doesNotMatch(clean, /url\(|position|behavior|9999/i, bad);
  }
});

test("foreign classes are dropped so a paste cannot impersonate the app", () => {
  const clean = sanitizeRich('<p class="bg-primary fixed inset-0 text-center">x</p>');
  assert.match(clean, /class="text-center"/);
  assert.doesNotMatch(clean, /bg-primary|fixed|inset-0/);
});

test("a title takes inline marks only, and blocks become spaces", () => {
  assert.equal(sanitizeInline("<h1>Big</h1><b>bold</b><p>para</p>"), "Big <strong>bold</strong> para");
  assert.equal(sanitizeInline("<ul><li>one</li><li>two</li></ul>"), "one two");
  assert.equal(sanitizeInline("one<br>two"), "one two");
  assert.equal(sanitizeInline("<script>x</script><b>safe</b>"), "<strong>safe</strong>");
});

test("pasted b and i are normalised rather than thrown away", () => {
  assert.equal(sanitizeRich("<b>bold</b> <i>italic</i>"), "<strong>bold</strong> <em>italic</em>");
  assert.equal(sanitizeInline("<b>bold</b>"), "<strong>bold</strong>");
});

// -------------------------------------------------------------- mirror ----

test("plaintext derivation keeps block boundaries and decodes entities", () => {
  // A paragraph break is a blank line; a <br> is a single newline. The mirror
  // has to keep them apart or a round trip loses the structure.
  assert.equal(htmlToText("<p>Hello <b>world</b></p><p>Second &amp; line</p>"), "Hello world\n\nSecond & line");
  assert.equal(htmlToText("<ul><li>one</li><li>two</li></ul>"), "one\ntwo");
  assert.equal(htmlToText("a<br>b"), "a\nb");
  assert.equal(htmlToText("&lt;not a tag&gt;"), "<not a tag>");
  assert.equal(htmlToText(""), "");
  assert.equal(htmlToText(undefined), "");
});

test("empty markup is recognised as empty", () => {
  assert.equal(isEmptyHtml("<p></p>"), true);
  assert.equal(isEmptyHtml("<p><br></p>"), true);
  assert.equal(isEmptyHtml(""), true);
  assert.equal(isEmptyHtml("<p>x</p>"), false);
});

test("plaintext round-trips back through markup unharmed", () => {
  const text = "Line one\nLine two\n\nNew paragraph <not a tag>";
  const html = textToHtml(text);
  assert.doesNotMatch(html, /<not a tag>/, "angle brackets are escaped, not left as markup");
  assert.equal(htmlToText(html), text);
});

test("applyRichText derives whichever half was not supplied", () => {
  const fromHtml = applyRichText({ description: undefined, descriptionHtml: "<p>Hello <b>world</b></p>" });
  assert.equal(fromHtml.description, "Hello world");
  assert.equal(fromHtml.descriptionHtml, "<p>Hello <strong>world</strong></p>");

  const fromText = applyRichText({ description: "Just text" });
  assert.equal(fromText.description, "Just text");
  assert.equal(fromText.descriptionHtml, "<p>Just text</p>");

  const untouched = applyRichText({ priority: "high" });
  assert.equal("description" in untouched, false, "a field nobody mentioned is left alone");
  assert.equal("descriptionHtml" in untouched, false);
});

test("markup wins when both halves are sent, so the mirror cannot be forged", () => {
  const body = applyRichText({
    description: "attacker supplied mirror",
    descriptionHtml: "<p>the real content</p>",
  });
  assert.equal(body.description, "the real content");
});

test("a title whose markup carries no text keeps its plaintext", () => {
  const body = applyRichText({ title: "Real title", titleHtml: "<span></span>" });
  assert.equal(body.title, "Real title");
});

// ----------------------------------------------------------------- api ----

test("a todo stores sanitized markup and a matching mirror", async () => {
  const { agent } = await makeUser(app);

  const res = await agent
    .post("/api/todo")
    .send({
      title: "Safety review",
      titleHtml: "<strong>Safety</strong> review",
      descriptionHtml: '<p style="text-align:center">Check the <b>exits</b></p><script>alert(1)</script>',
    })
    .expect(201);

  assert.equal(res.body.title, "Safety review");
  assert.equal(res.body.titleHtml, "<strong>Safety</strong> review");
  assert.equal(res.body.description, "Check the exits", "the mirror is the plaintext");
  assert.doesNotMatch(res.body.descriptionHtml, /<script/i, "the script never reached the database");
  assert.match(res.body.descriptionHtml, /<strong>exits<\/strong>/);
});

test("search still finds a todo written entirely through the editor", async () => {
  const { agent } = await makeUser(app);

  await agent
    .post("/api/todo")
    .send({ title: "Quarterly", descriptionHtml: "<p>The <em>fire extinguisher</em> needs checking</p>" })
    .expect(201);

  // The text index reads the mirror, so this only works if it was maintained.
  const found = await agent.get("/api/todo?q=extinguisher").expect(200);
  assert.equal(found.body.meta.totalRecords, 1, "the plaintext mirror keeps search working");
  assert.equal(found.body.data[0].title, "Quarterly");
});

test("a plaintext-only writer still produces renderable markup", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Plain", description: "Nothing fancy here" });

  assert.equal(todo.description, "Nothing fancy here");
  assert.equal(todo.descriptionHtml, "<p>Nothing fancy here</p>");
});

test("an update that touches only the markup keeps the mirror in step", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Before", description: "old text" });

  const updated = await agent
    .put(`/api/todo/${todo._id}`)
    .send({ descriptionHtml: "<p>brand new text</p>" })
    .expect(200);

  assert.equal(updated.body.description, "brand new text");

  const stored = await Todo.findById(todo._id).lean();
  assert.equal(stored.description, "brand new text");
});

test("an update that touches neither leaves both alone", async () => {
  const { agent } = await makeUser(app);
  const todo = await createTodo(agent, { title: "Keep", description: "keep me" });

  const updated = await agent.put(`/api/todo/${todo._id}`).send({ priority: "high" }).expect(200);

  assert.equal(updated.body.description, "keep me");
  assert.equal(updated.body.descriptionHtml, "<p>keep me</p>");
});

test("formatting survives the trash round trip", async () => {
  const { agent } = await makeUser(app);
  const todo = await agent
    .post("/api/todo")
    .send({ title: "Recover me", descriptionHtml: "<p>with <strong>formatting</strong></p>" })
    .expect(201)
    .then((res) => res.body);

  await agent.delete(`/api/todo/${todo._id}`).expect(200);
  const trash = await agent.get("/api/trash").expect(200);
  await agent.put(`/api/trash/${trash.body.data[0]._id}`).expect(200);

  const back = await agent.get(`/api/todo/${todo._id}`).expect(200);
  assert.equal(back.body.descriptionHtml, "<p>with <strong>formatting</strong></p>");
  assert.equal(back.body.description, "with formatting");
});

test("a template snapshots and restores formatting", async () => {
  const { agent } = await makeUser(app);
  const todo = await agent
    .post("/api/todo")
    .send({ title: "Source", descriptionHtml: "<p>a <em>formatted</em> brief</p>" })
    .expect(201)
    .then((res) => res.body);

  const template = await agent
    .post("/api/template/from-todo")
    .send({ todoId: todo._id, name: "Brief" })
    .expect(201)
    .then((res) => res.body);

  assert.equal(template.descriptionHtml, "<p>a <em>formatted</em> brief</p>");

  const made = await agent.post(`/api/template/${template._id}/use`).expect(201);
  assert.equal(made.body.descriptionHtml, "<p>a <em>formatted</em> brief</p>");
  assert.equal(made.body.description, "a formatted brief");
});

test("a duplicated todo keeps its formatting", async () => {
  const { agent } = await makeUser(app);
  const todo = await agent
    .post("/api/todo")
    .send({ title: "Original", descriptionHtml: "<p><strong>bold</strong> detail</p>" })
    .expect(201)
    .then((res) => res.body);

  const copy = await agent.post(`/api/todo/${todo._id}/duplicate`).expect(201);
  assert.equal(copy.body.descriptionHtml, "<p><strong>bold</strong> detail</p>");
  assert.equal(copy.body.title, "Original (copy)");
});

test("a project description accepts formatting; its name stays plain", async () => {
  const { agent } = await makeUser(app);

  const project = await agent
    .post("/api/project")
    .send({ name: "Facilities", descriptionHtml: "<p>The <b>main</b> site</p>" })
    .expect(201);

  assert.equal(project.body.name, "Facilities");
  assert.equal(project.body.description, "The main site");
  assert.equal(project.body.descriptionHtml, "<p>The <strong>main</strong> site</p>");
});

test("a description far longer than the old 1500 limit is accepted", async () => {
  const { agent } = await makeUser(app);
  const long = "word ".repeat(1000).trim(); // ~5000 characters

  const res = await agent
    .post("/api/todo")
    .send({ title: "Long", descriptionHtml: `<p>${long}</p>` })
    .expect(201);

  assert.ok(res.body.description.length > 1500, "the raised limit actually applies");
});

test("imported todos arrive with renderable markup", async () => {
  const { agent } = await makeUser(app);

  await agent
    .post("/api/account/import")
    .send({
      format: "json",
      dryRun: false,
      data: JSON.stringify([{ title: "Imported", description: "from a file" }]),
    })
    .expect(200);

  const list = await agent.get("/api/todo?q=Imported").expect(200);
  assert.equal(list.body.data[0].descriptionHtml, "<p>from a file</p>");
});
