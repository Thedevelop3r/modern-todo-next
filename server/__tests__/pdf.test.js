const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");

const { htmlToDoc } = require("../utils/richtext-doc");
const { sanitizeRich } = require("../utils/sanitize");
const pdfClient = require("../services/pdf.client");
const { binaryPath } = require("../services/pdf-service");

// ------------------------------------------------ html -> document tree ----

test("sanitized markup becomes the closed node set the renderer accepts", () => {
  const html = sanitizeRich(
    '<h2>Why</h2><p style="text-align:center">A todo becomes a <em>document</em>.</p>' +
      '<ol><li>Render</li><li>Version</li></ol><blockquote>Loopback only.</blockquote><pre>cargo build</pre>'
  );
  const doc = htmlToDoc(html);
  const types = doc.blocks.map((block) => block.type);

  assert.deepEqual(types, ["heading", "paragraph", "list", "quote", "code"]);
  assert.equal(doc.blocks[0].level, 2);
  assert.equal(doc.blocks[1].align, "center");
  assert.equal(doc.blocks[2].ordered, true);
  assert.deepEqual(
    doc.blocks[2].items.map((item) => item.map((run) => run.text).join("")),
    ["Render", "Version"]
  );
  assert.match(doc.blocks[4].text, /cargo build/);
  // The plaintext mirror travels too, so an empty tree still renders something.
  assert.match(doc.text, /A todo becomes a document/);
});

test("runs carry their marks and the styles the sanitizer validated", () => {
  const html = sanitizeRich(
    '<p>plain <strong>bold <em>both</em></strong> <span style="color:#4f46e5;font-size:18px">tinted</span> ' +
      '<a href="https://example.com">link</a></p>'
  );
  const [paragraph] = htmlToDoc(html).blocks;
  const find = (text) => paragraph.runs.find((run) => run.text.includes(text));

  assert.deepEqual(find("bold ").marks, ["strong"]);
  assert.deepEqual(find("both").marks, ["strong", "em"]);
  assert.equal(find("tinted").color, "#4f46e5");
  assert.equal(find("tinted").size, "18px");
  assert.equal(find("link").href, "https://example.com");
  assert.deepEqual(find("plain").marks, []);
});

test("empty markup and stray bullets produce no blocks", () => {
  assert.deepEqual(htmlToDoc("").blocks, []);
  assert.deepEqual(htmlToDoc("<p></p><ul><li></li></ul>").blocks, []);
});

test("a todo payload carries its fields, subtasks and title runs", () => {
  const payload = pdfClient.buildTodoPayload({
    todo: {
      title: "Ship it",
      titleHtml: "<p>Ship <strong>it</strong></p>",
      descriptionHtml: "<p>Body</p>",
      estimate: 3,
      subtasks: [{ title: "One", done: true }],
      tags: ["rust"],
    },
    project: { name: "Platform" },
    user: { name: "Bilal" },
    theme: { primary: "#4f46e5" },
    meta: { requestId: "req-1", generatedAt: "2026-09-12", reference: "TD-1", version: 2 },
  });

  assert.equal(payload.template, "general");
  assert.equal(payload.meta.version, 2);
  assert.equal(payload.document.titleRuns.at(-1).marks[0], "strong");
  assert.equal(payload.document.description.blocks[0].type, "paragraph");
  const labels = payload.document.fields.map((field) => field.label);
  assert.deepEqual(labels, ["Status", "Priority", "Due", "Project", "Estimate"]);
  assert.deepEqual(payload.document.subtasks, [{ title: "One", done: true }]);
});

// ------------------------------------------------------- the node client ----

/** Swap global fetch for the duration of one test. */
function withFetch(handler, run) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (...args) => {
    calls += 1;
    return handler(calls, ...args);
  };
  return run(() => calls).finally(() => {
    globalThis.fetch = original;
  });
}

const KEY = "test-internal-key-0123456789";

test.beforeEach(() => {
  pdfClient.resetBreaker();
  process.env.PDF_SERVICE_KEY = KEY;
});

test("the key travels in the header and PDF bytes come back as a Buffer", async () => {
  await withFetch(
    async (_call, url, init) => {
      assert.match(url, /\/render$/);
      assert.equal(init.headers["X-Internal-Key"], KEY);
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 200 });
    },
    async () => {
      const pdf = await pdfClient.render({ requestId: "r" });
      assert.ok(Buffer.isBuffer(pdf));
      assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    }
  );
});

test("a connection error is retried exactly once; a 4xx is not", async () => {
  await withFetch(
    async (call) => {
      if (call === 1) throw new Error("ECONNREFUSED");
      return new Response(new Uint8Array([0x25]), { status: 200 });
    },
    async (calls) => {
      await pdfClient.render({});
      assert.equal(calls(), 2);
    }
  );

  pdfClient.resetBreaker();

  await withFetch(
    async () => new Response(JSON.stringify({ error: "bad template" }), { status: 422 }),
    async (calls) => {
      await assert.rejects(pdfClient.render({}), /bad template/);
      assert.equal(calls(), 1);
    }
  );
});

test("the breaker opens after repeated failures and answers without calling out", async () => {
  await withFetch(
    async () => {
      throw new Error("ECONNREFUSED");
    },
    async (calls) => {
      // Each attempt burns two failures: the call and its one retry.
      for (let i = 0; i < pdfClient.FAILURE_THRESHOLD; i += 1) {
        await assert.rejects(pdfClient.render({}), /unavailable/);
      }
      const before = calls();
      await assert.rejects(pdfClient.render({}), /temporarily unavailable/);
      assert.equal(calls(), before, "an open breaker must not reach the network");
    }
  );
});

test("rendering without a key is reported as unconfigured, not attempted", async () => {
  delete process.env.PDF_SERVICE_KEY;
  await withFetch(
    async () => assert.fail("must not call the renderer"),
    async () => {
      await assert.rejects(pdfClient.render({}), /not configured/);
    }
  );
  process.env.PDF_SERVICE_KEY = KEY;
});

// --------------------------------------------------- the renderer itself ----

// Only runs where the binary has been built; CI without a Rust toolchain skips.
test("the renderer turns a payload into real PDF bytes", { skip: !binaryPath() }, async (t) => {
  const port = 8790;
  const key = "integration-key-0123456789";
  const child = spawn(binaryPath(), [], {
    env: { ...process.env, PDF_SERVICE_KEY: key, PDF_SERVICE_PORT: String(port) },
    stdio: "ignore",
  });
  t.after(() => child.kill("SIGTERM"));

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i += 1) {
    try {
      const probe = await fetch(`${base}/health`);
      if (probe.ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const previousUrl = process.env.PDF_SERVICE_URL;
  process.env.PDF_SERVICE_URL = base;
  process.env.PDF_SERVICE_KEY = key;
  t.after(() => {
    process.env.PDF_SERVICE_URL = previousUrl;
    process.env.PDF_SERVICE_KEY = KEY;
  });

  assert.equal(await pdfClient.health(), true);

  const payload = pdfClient.buildTodoPayload({
    todo: {
      title: "Ship the PDF service",
      titleHtml: "<p>Ship the <strong>PDF service</strong></p>",
      descriptionHtml: sanitizeRich("<h2>Why</h2><p>Costs #$% metachars.</p><ul><li>One</li></ul>"),
      subtasks: [{ title: "Typst World", done: true }],
      tags: ["rust"],
    },
    project: { name: "Platform" },
    user: { name: "Bilal" },
    theme: { primary: "#4f46e5" },
    meta: { requestId: "int-1", generatedAt: "2026-09-12", reference: "TD-1", version: 1 },
  });

  const pdf = await pdfClient.render(payload);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1000, "a one-page document should not be a stub");

  // A wrong key must be refused, and refused without detail.
  const refused = await fetch(`${base}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Key": "wrong-key-of-same-len-x" },
    body: JSON.stringify(payload),
  });
  assert.equal(refused.status, 401);
});
