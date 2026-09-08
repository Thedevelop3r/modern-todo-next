/**
 * The rate limiter is disabled for the main suite (helpers.js sets
 * DISABLE_RATE_LIMIT), so it gets its own file where the limit is switched on
 * and set low before the app is loaded.
 */

process.env.DISABLE_RATE_LIMIT = "false";
process.env.RATE_LIMIT_MAX = "3";

const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, request } = require("./helpers");

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

test("repeated failed logins are eventually rate limited", async () => {
  const attempt = () =>
    request(app).post("/api/user/login").send({ email: "nobody@example.com", password: "wrongpassword" });

  const statuses = [];
  for (let i = 0; i < 5; i++) {
    const res = await attempt();
    statuses.push(res.status);
  }

  assert.ok(statuses.includes(429), `expected a 429 among ${statuses.join(", ")}`);
  assert.equal(statuses[0], 400, "the first attempts should still be answered normally");
});
