// file.route.js - the object store, mounted at /api/files.
//
// Route order matters: the literal segments below are declared before /:id, or
// Express would read "quota" as a file id.

const crypto = require("node:crypto");
const router = require("express").Router();

const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { FileController } = require("../controller/File.controller");
const { StorageController } = require("../controller/Storage.controller");
const { ActivityController } = require("../controller");
const { storageTierSchema } = require("../validation/schemas");
const { validate } = require("../middleware");
const { jobRegistry } = require("../services/job-registry");

// ------------------------------------------------------------ storage ----

router.get(
  "/quota",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await StorageController.summary(req.user._id));
  })
);

router.put(
  "/quota/tier",
  validate(storageTierSchema),
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await StorageController.setTier(req.user._id, req.body));
  })
);

// ----------------------------------------------------------- progress ----

/**
 * Live upload and compression progress, as server-sent events.
 *
 * One stream per tab, multiplexed by job id - not one per upload. HTTP/1.1
 * allows six connections per origin, so a stream each would let three
 * concurrent uploads starve the rest of the application. SSE rather than a
 * WebSocket because nothing travels client-to-server here, and a second server
 * attached to the http listener would buy nothing.
 */
router.get("/events", (req, res) => {
  res.status(200).set({
    "Content-Type": "text/event-stream",
    // no-transform matters as much as no-cache: a proxy that "helpfully"
    // compresses this would buffer it, and the bar would jump 0 to 100.
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  const unsubscribe = jobRegistry.subscribe(req.user._id, res);

  // Idle proxies drop a silent connection; a comment line keeps it honest.
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      /* the cleanup below will run */
    }
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// -------------------------------------------------------------- files ----

router.get(
  "/",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await FileController.list({ userId: req.user._id, query: req.query }));
  })
);

/** A v4 UUID, which is the only shape a client-supplied job id may take. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.post(
  "/",
  asyncTryCatchWrapper(async (req, res) => {
    // The client may name the job, so it can match progress events to its own
    // row before the response arrives - the id it sends is only ever used to
    // address a job inside that user's own stream, never to look anything up.
    const supplied = req.get("X-Job-Id");
    const jobId = supplied && UUID.test(supplied) ? supplied : crypto.randomUUID();

    const file = await FileController.create({ req, user: req.user, jobId });
    res.status(201).json({ jobId, file });
  })
);

router.get(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await FileController.show({ fileId: req.params.id, userId: req.user._id }));
  })
);

/**
 * The bytes. Written as a handler rather than through res.json because it
 * streams, sets its own status (200/206/304/416) and must not be wrapped in
 * anything that would buffer it.
 */
const rawHandler = asyncTryCatchWrapper(async (req, res) => {
  await FileController.stream({
    fileId: req.params.id,
    userId: req.user._id,
    req,
    res,
    download: req.query.download === "1" || req.query.download === "true",
  });
});

/** The chain of custody: every recorded event for this file, newest first. */
router.get(
  "/:id/activity",
  asyncTryCatchWrapper(async (req, res) => {
    // Ownership is checked on the file first, so a stranger's id reveals no
    // trail - not even its length.
    await FileController.show({ fileId: req.params.id, userId: req.user._id });
    res.status(200).json(await ActivityController.forFile({ fileId: req.params.id, userId: req.user._id }));
  })
);

router.get("/:id/raw", rawHandler);
router.head("/:id/raw", rawHandler);

router.delete(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await FileController.destroy({ fileId: req.params.id, userId: req.user._id }));
  })
);

module.exports = { fileRouter: router };
