const test = require("node:test");
const assert = require("node:assert/strict");

const { connect, disconnect, reset, makeApp, makeUser } = require("./helpers");
const { StorageController } = require("../controller/Storage.controller");
const { User, StoredFile } = require("../models");
const { quotaForTier, capFor, kindForMime, FILE_FLAGS, MAX_ANY_FILE } = require("../config/storage");
const { runStorageSweep } = require("../services/storage-sweep");

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

const idOf = async (agent) => (await agent.get("/api/user/me").expect(200)).body._id;

// ------------------------------------------------------------- config ----

test("the storage table answers quotas, caps and kinds", () => {
  assert.equal(quotaForTier("base"), 1024 ** 3);
  assert.equal(quotaForTier("100gb"), 100 * 1024 ** 3);
  assert.equal(quotaForTier("nonsense"), 1024 ** 3, "an unknown tier falls back to free");

  assert.equal(capFor("image", "base"), 15 * 1024 ** 2);
  assert.equal(capFor("video", "plus"), 600 * 1024 ** 2);

  assert.equal(kindForMime("image/png"), "image");
  assert.equal(kindForMime("IMAGE/PNG"), "image", "the type is matched case-insensitively");
  assert.equal(kindForMime("image/png; charset=binary"), "image", "parameters are ignored");
  assert.equal(kindForMime("text/html"), null, "an unlisted type has no kind");
  assert.equal(kindForMime(undefined), null);

  assert.equal(MAX_ANY_FILE, 1024 ** 3, "busboy's hard limit is the largest plus cap");
});

test("the file flags are distinct single bits", () => {
  const values = Object.values(FILE_FLAGS);
  values.forEach((value) => assert.equal(value & (value - 1), 0, "each flag is one bit"));
  assert.equal(new Set(values).size, values.length, "no two flags share a bit");
});

// -------------------------------------------------------------- quota ----

test("a new account starts on the free tier with nothing used", async () => {
  const { agent } = await makeUser(app);
  const summary = await StorageController.summary(await idOf(agent));

  assert.equal(summary.usedBytes, 0);
  assert.equal(summary.quotaBytes, 1024 ** 3);
  assert.equal(summary.tier, "base");
  assert.equal(summary.fileCount, 0);
});

test("reserve claims space and refuses once the quota is gone", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  await StorageController.reserve(userId, 400 * 1024 ** 2);
  let user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, 400 * 1024 ** 2);

  await assert.rejects(
    () => StorageController.reserve(userId, 700 * 1024 ** 2),
    (error) => error.statusCode === 413
  );

  user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, 400 * 1024 ** 2, "a refused reservation changes nothing");
});

test("concurrent reservations never oversubscribe the quota", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  // Ten racing claims of 150 MB against a 1 GB quota: six fit, four must fail.
  const chunk = 150 * 1024 ** 2;
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => StorageController.reserve(userId, chunk))
  );

  const granted = results.filter((result) => result.status === "fulfilled").length;
  const refused = results.filter((result) => result.status === "rejected").length;

  assert.equal(granted, 6, "exactly as many as fit were granted");
  assert.equal(refused, 4);

  const user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, granted * chunk);
  assert.ok(user.storage.usedBytes <= user.storage.quotaBytes, "the quota was never exceeded");
});

test("reconcile corrects a reservation and release hands it all back", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  await StorageController.reserve(userId, 1000);
  await StorageController.reconcile(userId, 250 - 1000); // compression shrank it
  let user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, 250);

  await StorageController.release(userId, 250);
  user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, 0);
});

test("the counter is clamped rather than allowed to go negative", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  await StorageController.release(userId, 5000);
  const user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, 0);
});

test("recompute rebuilds the counter from the files that exist", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  await StoredFile.create([
    { ownerId: userId, scope: { kind: "user" }, kind: "image", filename: "a.webp",
      mime: "image/webp", originalSize: 900, storedSize: 300, state: "ready" },
    { ownerId: userId, scope: { kind: "user" }, kind: "image", filename: "b.webp",
      mime: "image/webp", originalSize: 900, storedSize: 700, state: "ready" },
    { ownerId: userId, scope: { kind: "user" }, kind: "image", filename: "c.webp",
      mime: "image/webp", originalSize: 900, storedSize: 500, state: "failed" },
  ]);

  // Simulate the drift a crash between reserve and reconcile would leave.
  await User.updateOne({ _id: userId }, { $set: { "storage.usedBytes": 99999 } });

  const total = await StorageController.recompute(userId);
  assert.equal(total, 1000, "only ready files count");

  const user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, 1000);
});

test("recompute counts each owner separately", async () => {
  const alice = await makeUser(app);
  const bob = await makeUser(app);
  const aliceId = await idOf(alice.agent);
  const bobId = await idOf(bob.agent);

  await StoredFile.create([
    { ownerId: aliceId, scope: { kind: "user" }, kind: "image", filename: "a", mime: "image/webp",
      originalSize: 10, storedSize: 10, state: "ready" },
    { ownerId: bobId, scope: { kind: "user" }, kind: "image", filename: "b", mime: "image/webp",
      originalSize: 40, storedSize: 40, state: "ready" },
  ]);

  assert.equal(await StorageController.recompute(aliceId), 10);
  assert.equal(await StorageController.recompute(bobId), 40);
});

test("summary self-heals a counter that has drifted past the tolerance", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  await StoredFile.create({
    ownerId: userId, scope: { kind: "user" }, kind: "image", filename: "a.webp",
    mime: "image/webp", originalSize: 900, storedSize: 500, state: "ready",
  });
  await User.updateOne({ _id: userId }, { $set: { "storage.usedBytes": 900 * 1024 ** 2 } });

  const summary = await StorageController.summary(userId);
  assert.equal(summary.usedBytes, 500, "the drifted counter was rebuilt");
  assert.equal(summary.fileCount, 1);
});

// --------------------------------------------------------------- tier ----

test("changing tier moves the quota and the per-file caps together", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  const summary = await StorageController.setTier(userId, { tier: "25gb", perFileTier: "plus" });
  assert.equal(summary.tier, "25gb");
  assert.equal(summary.quotaBytes, 25 * 1024 ** 3);
  assert.equal(summary.perFileTier, "plus");
  assert.equal(summary.caps.video, 600 * 1024 ** 2);

  const user = await User.findById(userId).select("storage");
  assert.equal(StorageController.capForUser(user, "document"), 1024 ** 3);
});

test("an unknown tier is rejected", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  await assert.rejects(
    () => StorageController.setTier(userId, { tier: "1tb" }),
    (error) => error.statusCode === 400
  );
  await assert.rejects(
    () => StorageController.setTier(userId, {}),
    (error) => error.statusCode === 400
  );
});

test("a bigger tier makes a previously refused reservation fit", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  const twoGigabytes = 2 * 1024 ** 3;
  await assert.rejects(() => StorageController.reserve(userId, twoGigabytes));

  await StorageController.setTier(userId, { tier: "10gb" });
  await StorageController.reserve(userId, twoGigabytes);

  const user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, twoGigabytes);
});

// -------------------------------------------------------------- sweep ----

test("the boot sweep fails interrupted files and rebuilds the counter", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  const stranded = await StoredFile.create({
    ownerId: userId, scope: { kind: "user" }, kind: "video", filename: "big.mp4",
    mime: "video/mp4", originalSize: 5000, storedSize: 0, state: "compressing",
  });
  await StorageController.reserve(userId, 5000);

  const result = await runStorageSweep();
  assert.equal(result.files, 1);
  assert.equal(result.owners, 1);

  const after = await StoredFile.findById(stranded._id);
  assert.equal(after.state, "failed");
  assert.match(after.error, /restart/i);

  const user = await User.findById(userId).select("storage");
  assert.equal(user.storage.usedBytes, 0, "the stranded reservation was reclaimed");
});

test("the boot sweep leaves ready files alone", async () => {
  const { agent } = await makeUser(app);
  const userId = await idOf(agent);

  const ready = await StoredFile.create({
    ownerId: userId, scope: { kind: "user" }, kind: "image", filename: "a.webp",
    mime: "image/webp", originalSize: 900, storedSize: 300, state: "ready",
  });

  await runStorageSweep();

  const after = await StoredFile.findById(ready._id);
  assert.equal(after.state, "ready");
});
