const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser, request } = require("./helpers");

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

test("the health endpoint reports the version and the database state", async () => {
  const res = await request(app).get("/api/health").expect(200);

  assert.equal(res.body.status, "ok");
  assert.equal(res.body.version, require("../../package.json").version);
  assert.equal(res.body.database, "connected");
  assert.equal(typeof res.body.uptimeSeconds, "number");
  assert.ok(res.body.time);
  // It must not need a session.
  assert.equal(res.headers["set-cookie"], undefined);
});

test("every response carries a request id, and errors echo it back", async () => {
  const res = await request(app).get("/api/health").expect(200);
  const id = res.headers["x-request-id"];
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(res.body.requestId, id);

  // Unknown paths only reach the 404 handler once past `auth`, which guards
  // the catch-all routers.
  const alice = await makeUser(app);
  const missing = await alice.agent.get("/api/nope").expect(404);
  assert.equal(missing.body.requestId, missing.headers["x-request-id"]);

  const unauthorised = await request(app).get("/api/todo").expect(401);
  assert.equal(unauthorised.body.requestId, unauthorised.headers["x-request-id"]);
});

test("an incoming request id is kept rather than replaced", async () => {
  const res = await request(app).get("/api/health").set("X-Request-Id", "trace-me").expect(200);
  assert.equal(res.headers["x-request-id"], "trace-me");
  assert.equal(res.body.requestId, "trace-me");
});

test("the UI scale preference round-trips like the others", async () => {
  const alice = await makeUser(app);

  const me = await alice.agent.get("/api/user/me").expect(200);
  assert.equal(me.body.preferences.uiScale, "normal");

  const saved = await alice.agent
    .put("/api/user/preferences")
    .send({ uiScale: "large", density: "compact" })
    .expect(200);
  assert.equal(saved.body.preferences.uiScale, "large");
  assert.equal(saved.body.preferences.density, "compact");

  await alice.agent.put("/api/user/preferences").send({ uiScale: "enormous" }).expect(400);
});
