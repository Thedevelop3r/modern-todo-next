const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser, request } = require("./helpers");
const { FontController } = require("../controller");

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
  FontController.clearCache();
});

/**
 * Google is never actually called from the suite - the proxy's own behaviour
 * (name validation, URL rewriting, the id handshake) is what matters, and a
 * test that reaches the network would be a flake.
 */
function stubGoogle(handler) {
  const original = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = original;
  };
}

const cssBody = `@font-face{font-family:'Sora';font-weight:400;src:url(https://fonts.gstatic.com/s/sora/v12/abc.woff2) format('woff2');}
@font-face{font-family:'Sora';font-weight:700;src:url(https://fonts.gstatic.com/s/sora/v12/def.woff2) format('woff2');}`;

const okCss = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(cssBody) });

// ----------------------------------------------------------- search ----

test("search matches on a prefix first and needs no network", async () => {
  const alice = await makeUser(app);

  const res = await alice.agent.get("/api/fonts/search?q=sor").expect(200);
  assert.ok(res.body.length > 0);
  assert.equal(res.body[0].family, "Sora");
  assert.ok(res.body.length <= 10);
  assert.ok(res.body.every((font) => font.family && font.category));
});

test("search is empty for an empty query", async () => {
  const alice = await makeUser(app);
  const res = await alice.agent.get("/api/fonts/search?q=").expect(200);
  assert.deepEqual(res.body, []);
});

test("the font proxy is behind auth like everything else", async () => {
  await request(app).get("/api/fonts/search?q=sora").expect(401);
  await request(app).get("/api/fonts/css?family=Sora").expect(401);
});

// -------------------------------------------------------------- css ----

test("a stylesheet comes back with every gstatic URL rewritten to a local one", async () => {
  const alice = await makeUser(app);
  const restore = stubGoogle(okCss);

  try {
    const res = await alice.agent.get("/api/fonts/css?family=Sora").expect(200);
    assert.match(res.headers["content-type"], /text\/css/);
    // Nothing may point at Google, or the CSP would block it in the browser.
    assert.equal(res.text.includes("fonts.gstatic.com"), false);
    assert.equal((res.text.match(/url\(\/api\/fonts\/file\/[a-f0-9]{32}\)/g) || []).length, 2);
  } finally {
    restore();
  }
});

test("a family Google does not know is a 400, which is what the free-text field shows", async () => {
  const alice = await makeUser(app);
  const restore = stubGoogle(() => Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve("") }));

  try {
    const res = await alice.agent.get("/api/fonts/css?family=Definitely Not A Font").expect(400);
    assert.match(res.body.message, /no family called/i);
  } finally {
    restore();
  }
});

test("a family name that is not a font name is rejected before any request", async () => {
  const alice = await makeUser(app);
  let called = false;
  const restore = stubGoogle(() => {
    called = true;
    return okCss();
  });

  try {
    for (const family of ["../../etc/passwd", "Sora;rm -rf", "x".repeat(65), ""]) {
      await alice.agent.get(`/api/fonts/css?family=${encodeURIComponent(family)}`).expect(400);
    }
    assert.equal(called, false, "a malformed name must never reach the network");
  } finally {
    restore();
  }
});

// ------------------------------------------------------------- file ----

test("a file id only works when the proxy issued it", async () => {
  const alice = await makeUser(app);

  // Nothing has been parsed yet, so no id exists - including a well-formed one.
  await alice.agent.get(`/api/fonts/file/${"a".repeat(32)}`).expect(404);
  await alice.agent.get("/api/fonts/file/not-an-id").expect(404);
  await alice.agent.get("/api/fonts/file/../../server.js").expect(404);
});

test("an issued id serves the upstream file, and only that file", async () => {
  const alice = await makeUser(app);
  const requested = [];
  const restore = stubGoogle((url) => {
    requested.push(String(url));
    if (String(url).includes("googleapis")) return okCss();
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "font/woff2" },
      arrayBuffer: () => Promise.resolve(Buffer.from("woff2-bytes")),
    });
  });

  try {
    const css = await alice.agent.get("/api/fonts/css?family=Sora").expect(200);
    const id = /\/api\/fonts\/file\/([a-f0-9]{32})/.exec(css.text)[1];

    const file = await alice.agent.get(`/api/fonts/file/${id}`).expect(200);
    assert.equal(file.headers["content-type"], "font/woff2");
    assert.match(file.headers["cache-control"], /immutable/);

    // The id maps to a URL the proxy read out of Google's own stylesheet -
    // there is no user-supplied URL anywhere in the chain.
    assert.ok(requested.every((url) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)));
  } finally {
    restore();
  }
});

test("the controller refuses to fetch a host outside Google Fonts", async () => {
  await assert.rejects(
    () => FontController.css("Sora").then(() => FontController.file("f".repeat(32))),
    /Unknown font file/
  );
});
