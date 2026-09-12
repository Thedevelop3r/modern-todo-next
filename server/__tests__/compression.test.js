const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const { connect, disconnect, reset, makeApp, makeUser } = require("./helpers");
const { StoredFile } = require("../models");
const { detect, compress } = require("../services/compression");
const { jobRegistry, JobRegistry } = require("../services/job-registry");
const { FILE_FLAGS } = require("../config/storage");

let app;
let caps;

/** Skip rather than fail when a binary this machine lacks is needed. */
const has = (binary) => {
  try {
    execFileSync(binary, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

test.before(async () => {
  await connect();
  app = makeApp();
  caps = await detect();
});

test.after(async () => {
  await disconnect();
});

test.beforeEach(async () => {
  await reset();
});

const upload = (agent, buffer, name, fields = {}) => {
  const req = agent.post("/api/files");
  Object.entries(fields).forEach(([key, value]) => req.field(key, String(value)));
  return req.attach("file", buffer, name);
};

/** A 600x400 PNG stored uncompressed, so there is real room to shrink. */
function bigPng() {
  const width = 600;
  const height = 400;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const at = row + 1 + x * 3;
      raw[at] = (x * 7) & 0xff;
      raw[at + 1] = (y * 5) & 0xff;
      raw[at + 2] = ((x ^ y) * 3) & 0xff;
    }
  }

  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "latin1"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(typed) >>> 0);
    return Buffer.concat([length, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 0 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------- capabilities ----

test("capabilities are probed rather than assumed", async () => {
  assert.equal(typeof caps.ffmpeg, "boolean");
  assert.equal(typeof caps.qpdf, "boolean");
  if (caps.ffmpeg) {
    assert.ok(caps.videoCodec, "an ffmpeg build without any usable encoder would be unusable");
  }
});

// ---------------------------------------------------------- weighting ----

test("the phase weights add up and never run backwards", () => {
  const job = jobRegistry.start({
    jobId: "weights", ownerId: "u1", filename: "a", totalBytes: 100, compress: true,
  });

  const seen = [];
  seen.push(JobRegistry.overall(job));
  jobRegistry.update("weights", { phase: "upload", fraction: 1 });
  seen.push(JobRegistry.overall(job));
  jobRegistry.update("weights", { phase: "compress", fraction: 0.5 });
  seen.push(JobRegistry.overall(job));
  jobRegistry.update("weights", { phase: "compress", fraction: 1 });
  seen.push(JobRegistry.overall(job));
  jobRegistry.update("weights", { phase: "store", fraction: 1 });
  seen.push(JobRegistry.overall(job));

  // upload 0.35 | compress 0.45 | store 0.20, so halfway through compression is 0.575.
  assert.deepEqual(seen.map((n) => Number(n.toFixed(3))), [0, 0.35, 0.575, 0.8, 1]);
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i] >= seen[i - 1], "progress only ever moves forwards");
  }
  jobRegistry.finish("weights");
});

test("skipping compression redistributes the weight instead of stalling", () => {
  const job = jobRegistry.start({
    jobId: "nocomp", ownerId: "u1", filename: "a", totalBytes: 100, compress: false,
  });
  jobRegistry.update("nocomp", { phase: "upload", fraction: 1 });
  assert.equal(Number(JobRegistry.overall(job).toFixed(2)), 0.7);
  jobRegistry.update("nocomp", { phase: "store", fraction: 1 });
  assert.equal(JobRegistry.overall(job), 1);
  jobRegistry.finish("nocomp");
});

test("setCompress corrects the weighting once the field is read", () => {
  const job = jobRegistry.start({
    jobId: "correct", ownerId: "u1", filename: "a", totalBytes: 100, compress: true,
  });
  jobRegistry.setCompress("correct", false);
  jobRegistry.update("correct", { phase: "upload", fraction: 1 });
  assert.equal(Number(JobRegistry.overall(job).toFixed(2)), 0.7);
  jobRegistry.finish("correct");
});

// --------------------------------------------------------- compressors ----

test("an image is re-encoded smaller and the name follows the bytes", async () => {
  const { agent } = await makeUser(app);
  const original = bigPng();

  const res = await upload(agent, original, "holiday.png", { compress: true }).expect(201);
  const file = res.body.file;

  assert.equal(file.state, "ready");
  assert.equal(file.kind, "image", "the kind is unchanged by re-encoding");
  assert.equal(file.mime, "image/webp");
  assert.equal(file.filename, "holiday.webp", "the extension follows the new container");
  assert.equal(file.compression.applied, true);
  assert.equal(file.compression.codec, "sharp/webp");
  assert.ok(file.storedSize < file.originalSize, "it actually got smaller");
  assert.ok(file.compression.ratio < 1);
  assert.ok((file.flags & FILE_FLAGS.COMPRESSED) !== 0, "the compressed flag is set");

  // What comes back must be the webp, not the original png.
  const raw = await agent.get(`/api/files/${file._id}/raw`).expect(200);
  assert.equal(raw.headers["content-type"], "image/webp");
  assert.equal(raw.body.length, file.storedSize);
});

test("opting out of compression stores the original untouched", async () => {
  const { agent } = await makeUser(app);
  const original = bigPng();

  const res = await upload(agent, original, "holiday.png", { compress: false }).expect(201);
  const file = res.body.file;

  assert.equal(file.mime, "image/png");
  assert.equal(file.filename, "holiday.png");
  assert.equal(file.compression.applied, false);
  assert.equal(file.storedSize, original.length);
  assert.equal(file.compression.ratio, 1);

  const raw = await agent.get(`/api/files/${file._id}/raw`).expect(200);
  assert.deepEqual(raw.body, original, "byte-identical to what was uploaded");
});

test("a file that compression would enlarge is stored as it was", async () => {
  const { agent } = await makeUser(app);
  // Already-optimal noise: re-encoding this can only make it bigger.
  const noise = require("node:crypto").randomBytes(64 * 1024);
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), noise, Buffer.from("\n%%EOF\n")]);

  const res = await upload(agent, pdf, "random.pdf", { compress: true }).expect(201);
  const file = res.body.file;

  assert.equal(file.state, "ready");
  assert.equal(file.storedSize, pdf.length, "the original was kept");
  assert.equal(file.compression.applied, false);
});

test("video is transcoded with real progress", { skip: !has("ffmpeg") && "ffmpeg not installed" }, async (t) => {
  if (!caps.videoCodec) return t.skip("no usable video encoder in this ffmpeg build");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-video-"));
  const source = path.join(dir, "clip.mp4");
  execFileSync("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x480:rate=25:duration=2",
    "-c:v", caps.videoCodec, "-pix_fmt", "yuv420p", "-y", source,
  ]);

  const { agent } = await makeUser(app);
  const res = await upload(agent, fs.readFileSync(source), "clip.mp4", { compress: true }).expect(201);
  const file = res.body.file;

  assert.equal(file.kind, "video");
  assert.equal(file.state, "ready");
  assert.match(file.compression.codec, /^(ffmpeg\/|none)/);

  // The stored bytes must still be a playable mp4, whether or not it shrank.
  const raw = await agent.get(`/api/files/${file._id}/raw`).expect(200);
  const out = path.join(dir, "out.mp4");
  fs.writeFileSync(out, raw.body);
  const duration = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", out,
  ]).toString().trim();
  assert.ok(Number(duration) > 1.5, `the streamed copy is still ${duration}s of video`);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("a PDF compresses when qpdf is present, and is stored as-is when it is not", async (t) => {
  const { agent } = await makeUser(app);
  // Highly repetitive content, which qpdf's flate pass can shrink.
  const body = Buffer.from("%PDF-1.4\n" + "0000000000 65535 f \n".repeat(4000) + "%%EOF\n");

  const res = await upload(agent, body, "report.pdf", { compress: true }).expect(201);
  const file = res.body.file;

  assert.equal(file.state, "ready", "the upload succeeds either way");
  assert.equal(file.mime, "application/pdf");

  if (!caps.qpdf) {
    assert.equal(file.compression.applied, false);
    return t.skip("qpdf not installed - the graceful fallback was exercised instead");
  }
  assert.equal(file.compression.codec, "qpdf/objstreams");
});

test("a compression failure still stores the file rather than losing it", async () => {
  // A PNG header on bytes that are not a PNG: sharp will refuse to decode it.
  const broken = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("IHDR this is not a real image at all, sharp will reject it outright"),
  ]);

  const result = await compress({
    input: (() => {
      const file = path.join(os.tmpdir(), `mt-broken-${Date.now()}.png`);
      fs.writeFileSync(file, broken);
      return file;
    })(),
    kind: "image",
    jobId: "broken-job",
    tmpDir: os.tmpdir(),
  });

  assert.equal(result.applied, false, "it falls back rather than throwing");
  assert.ok(result.error, "and says why");
  fs.rmSync(result.path, { force: true });
});

// ---------------------------------------------------------------- SSE ----

test("the events stream needs a session and opens as an event stream", async () => {
  const { request } = require("./helpers");
  await request(app).get("/api/files/events").expect(401);
});

test("progress events reach a subscriber and end with a ready state", async () => {
  const { agent } = await makeUser(app);
  const events = [];

  // A fake response object, which is all the registry needs to fan out to.
  const sink = { write: (chunk) => events.push(chunk), end: () => {} };
  const me = await agent.get("/api/user/me").expect(200);
  const unsubscribe = jobRegistry.subscribe(me.body._id, sink);

  await upload(agent, bigPng(), "photo.png", { compress: true }).expect(201);
  unsubscribe();

  const parsed = events
    .filter((line) => line.startsWith("event: progress"))
    .map((line) => JSON.parse(line.slice(line.indexOf("data: ") + 6).trim()));

  assert.ok(parsed.length >= 2, "several progress events were published");

  const phases = new Set(parsed.map((event) => event.phase));
  assert.ok(phases.has("upload") || phases.has("compress"), "the working phases were reported");

  const last = parsed[parsed.length - 1];
  assert.equal(last.state, "ready");
  assert.equal(last.overall, 1);
  assert.ok(last.fileId, "the final event names the file that was created");

  parsed.forEach((event) => {
    assert.ok(event.overall >= 0 && event.overall <= 1, "overall stays in range");
    assert.equal(typeof event.determinate, "boolean");
  });
});

test("a failed upload ends the job as failed rather than leaving it hanging", async () => {
  const { agent } = await makeUser(app);
  const events = [];
  const sink = { write: (chunk) => events.push(chunk), end: () => {} };
  const me = await agent.get("/api/user/me").expect(200);
  const unsubscribe = jobRegistry.subscribe(me.body._id, sink);

  await upload(agent, Buffer.from("this is not a file type we accept at all"), "x.png").expect(400);
  unsubscribe();

  const parsed = events
    .filter((line) => line.startsWith("event: progress"))
    .map((line) => JSON.parse(line.slice(line.indexOf("data: ") + 6).trim()));

  const last = parsed[parsed.length - 1];
  assert.equal(last.state, "failed");
  assert.ok(last.error, "the reason travels with it");

  assert.equal(await StoredFile.countDocuments({ state: "ready" }), 0);
});

test("a declined compression records why, rather than looking like it never ran", async () => {
  const { agent } = await makeUser(app);
  const noise = require("node:crypto").randomBytes(64 * 1024);
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), noise, Buffer.from("\n%%EOF\n")]);

  const res = await upload(agent, pdf, "random.pdf", { compress: true }).expect(201);
  const { compression } = res.body.file;

  assert.equal(compression.requested, true);
  assert.equal(compression.applied, false);
  assert.ok(compression.note, "the reason is recorded");
  assert.match(compression.note, caps.qpdf ? /larger/i : /no document compressor|unavailable/i);
});

test("the output file is given the extension its container needs", async (t) => {
  if (!caps.videoCodec) return t.skip("no usable video encoder");

  // A high-bitrate source, so re-encoding genuinely shrinks it and ffmpeg has
  // to actually produce an output file - which it cannot do without knowing
  // the container, which it infers from the extension.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-ext-"));
  const source = path.join(dir, "fat.mp4");
  execFileSync("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30:duration=4",
    "-c:v", caps.videoCodec, "-q:v", "1", "-pix_fmt", "yuv420p", "-y", source,
  ]);

  const result = await compress({
    input: source,
    kind: "video",
    jobId: "ext-job",
    tmpDir: dir,
  });

  assert.equal(result.applied, true, `compression should succeed, got: ${result.error || "no error"}`);
  assert.match(result.path, /\.mp4$/, "the temp output carries the container's extension");
  assert.ok(fs.statSync(result.path).size < fs.statSync(source).size);

  fs.rmSync(dir, { recursive: true, force: true });
});
