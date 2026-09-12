// File.controller.js - the object store's read and write paths.
//
// Nothing here buffers a whole file. An upload is streamed to a temp file,
// identified from its own bytes, then streamed into GridFS; a download is
// streamed straight back out, range by range. `Buffer.concat` appears nowhere,
// which is what lets a 600 MB video move through a process with a flat RSS.

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const Busboy = require("busboy");

const { StoredFile, GeneratedPdf, Todo, Project, Template } = require("../models");
const { ApiError } = require("../utils/api-error");
const { getBucket, deleteBytes } = require("../utils/gridfs");
const { sniffMime, safeFilename, dispositionFilename, SNIFF_BYTES } = require("../utils/file-type");
const { StorageController } = require("./Storage.controller");
const { ActivityController } = require("./Activity.controller");
const { tempDir } = require("../services/storage-sweep");
const { compress } = require("../services/compression");
const { jobRegistry } = require("../services/job-registry");
const {
  FILE_FLAGS,
  INLINE_SAFE_MIME,
  KINDS,
  MAX_ANY_FILE,
  capFor,
  kindForMime,
} = require("../config/storage");

const SCOPE_KINDS = ["todo", "project", "template", "user", "variant"];

/** Which model owns a scope, so ownership can be checked before we keep bytes. */
const SCOPE_MODEL = { todo: Todo, project: Project, template: Template };

const unlinkQuietly = (file) => (file ? fsp.unlink(file).catch(() => {}) : Promise.resolve());

/**
 * Confirm the caller owns whatever they are attaching to. A scope the user does
 * not own answers 404, like every other cross-owner lookup in this API.
 */
async function assertScopeOwned({ kind, refId, userId }) {
  if (!SCOPE_KINDS.includes(kind)) throw ApiError.badRequest("Unknown attachment target");

  if (kind === "user" || kind === "variant") return null;
  if (!refId) throw ApiError.badRequest(`A ${kind} id is required`);

  const record = await SCOPE_MODEL[kind].findOne({ _id: refId, ownerId: userId }).select("_id");
  if (!record) throw ApiError.notFound(`${kind[0].toUpperCase()}${kind.slice(1)} not found`);
  return record._id;
}

/**
 * Read the multipart body to a temp file.
 *
 * The byte counter is ours rather than busboy's because the same pass feeds the
 * upload progress and the checksum; busboy's own `fileSize` limit is kept as a
 * hard backstop at the largest cap any tier allows.
 */
function receiveUpload({ req, destination, maxBytes, onProgress }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve(value);
    };

    let busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: { files: 1, fields: 12, fileSize: maxBytes, fieldSize: 1024 },
      });
    } catch {
      finish(ApiError.badRequest("Expected a multipart upload"));
      return;
    }

    const fields = {};
    let clientName = "";
    let received = 0;
    let head = null;
    let sawFile = false;
    let writeStream = null;

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (name, stream, info) => {
      // Only the first file part is kept; a second is drained, not stored.
      if (sawFile) {
        stream.resume();
        return;
      }
      sawFile = true;
      // The browser-supplied name is kept only to derive a display name from.
      clientName = info?.filename;

      writeStream = fs.createWriteStream(destination);

      stream.on("data", (chunk) => {
        received += chunk.length;
        if (head === null) head = chunk.subarray(0, SNIFF_BYTES);
        else if (head.length < SNIFF_BYTES) {
          head = Buffer.concat([head, chunk.subarray(0, SNIFF_BYTES - head.length)]);
        }
        if (onProgress) onProgress(received);
      });

      stream.on("limit", () => {
        writeStream.destroy();
        finish(ApiError.payloadTooLarge("That file is larger than your plan allows"));
      });

      stream.on("error", (error) => {
        writeStream.destroy();
        finish(error);
      });

      pipeline(stream, writeStream).catch((error) => {
        if (!settled) finish(error);
      });
    });

    busboy.on("error", (error) => finish(error));

    busboy.on("close", () => {
      if (!sawFile) {
        finish(ApiError.badRequest("No file was uploaded"));
        return;
      }
      const done = () => finish(null, { fields, clientName, received, head: head || Buffer.alloc(0) });
      // `close` can beat the write stream's flush, so wait for the bytes to land.
      if (writeStream && !writeStream.closed) writeStream.once("close", done);
      else done();
    });

    req.pipe(busboy);
  });
}

/** sha256 of a file on disk, read in one streaming pass. */
async function hashFile(file) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

/** Parse a single-range header against a known size. */
function parseRange(header, size) {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match) return { unsatisfiable: true };

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return { unsatisfiable: true };

  let start;
  let end;

  if (rawStart === "") {
    // `bytes=-500` means the last 500 bytes.
    const suffix = Number(rawEnd);
    if (!suffix) return { unsatisfiable: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return { unsatisfiable: true };
  }
  return { start, end };
}

class File {
  /**
   * Take one uploaded file: receive it, identify it, reserve for it and store it.
   *
   * The quota is claimed from the declared Content-Length before any bytes are
   * written, so an upload that cannot fit costs nothing but the request.
   */
  static async create({ req, user, jobId }) {
    const userId = user._id;
    const perFileTier = user.storage?.perFileTier || "base";
    const hardLimit = Math.min(MAX_ANY_FILE, capFor("document", perFileTier));

    const declared = Number(req.headers["content-length"]) || 0;
    const reserved = declared > 0 ? declared : hardLimit;

    const scratch = tempDir();
    const destination = path.join(scratch, `${jobId}.in`);
    let compressedPath = null;
    let reservationHeld = false;
    let stored = null;

    // The job has to exist before the first byte so the bar can move, but the
    // compress field is only parsed a moment later - so it starts assuming
    // compression and the weighting is corrected below.
    jobRegistry.start({ jobId, ownerId: userId, filename: "", totalBytes: declared, compress: true });

    try {
      await StorageController.reserve(userId, reserved);
      reservationHeld = true;

      const { fields, clientName, received, head } = await receiveUpload({
        req,
        destination,
        maxBytes: hardLimit,
        onProgress: (loaded) =>
          jobRegistry.update(jobId, {
            phase: "upload",
            fraction: declared > 0 ? loaded / declared : 0,
            determinate: declared > 0,
          }),
      });

      if (received === 0) throw ApiError.badRequest("That file is empty");

      // The bytes decide what this is - never the client's Content-Type.
      let mime = sniffMime(head);
      if (!mime) throw ApiError.badRequest("That file type is not supported");

      const kind = kindForMime(mime);
      const cap = capFor(kind, perFileTier);
      if (received > cap) {
        throw ApiError.payloadTooLarge(
          `A ${kind} may be up to ${Math.floor(cap / 1024 ** 2)} MB on your plan`
        );
      }

      const scopeKind = fields.scopeKind || "user";
      const refId = await assertScopeOwned({ kind: scopeKind, refId: fields.scopeId, userId });

      const compressRequested = fields.compress === "true" || fields.compress === "1";
      jobRegistry.setCompress(jobId, compressRequested);

      let filename = safeFilename(fields.filename || clientName, mime);

      stored = await StoredFile.create({
        ownerId: userId,
        scope: { kind: scopeKind, refId },
        kind,
        source: "upload",
        filename,
        mime,
        originalSize: received,
        compression: { requested: compressRequested },
        flags: (INLINE_SAFE_MIME.has(mime) ? FILE_FLAGS.INLINE_SAFE : 0) | FILE_FLAGS.PROBED,
        jobId,
        state: compressRequested ? "compressing" : "storing",
      });
      jobRegistry.update(jobId, { fileId: stored._id, state: stored.state });

      let source = destination;
      let applied = false;
      let codec = "none";
      let note = "";

      if (compressRequested) {
        const result = await compress({ input: destination, kind, jobId, tmpDir: scratch });
        note = result.note || "";
        if (result.applied) {
          compressedPath = result.path;
          source = result.path;
          applied = true;
          codec = result.codec;
          // Re-encoding can change the container, and the name must follow the
          // bytes or the download would be mislabelled.
          if (result.mime && result.mime !== mime) {
            mime = result.mime;
            filename = safeFilename(filename, mime);
          }
        }
      }

      jobRegistry.update(jobId, { phase: "store", fraction: 0, determinate: true, state: "storing" });
      await StoredFile.updateOne({ _id: stored._id }, { $set: { state: "storing" } });

      const storedSize = (await fsp.stat(source)).size;
      const checksum = await hashFile(source);

      stored.filename = filename;
      stored.mime = mime;
      const gridfsId = await File.writeBytes({
        source,
        stored,
        onProgress: (written) =>
          jobRegistry.update(jobId, {
            phase: "store",
            fraction: storedSize > 0 ? written / storedSize : 1,
            determinate: true,
          }),
      });

      stored.gridfsId = gridfsId;
      stored.storedSize = storedSize;
      stored.checksum = checksum;
      stored.compression.applied = applied;
      stored.compression.codec = codec;
      stored.compression.note = note.slice(0, 200);
      stored.compression.ratio = received > 0 ? Number((storedSize / received).toFixed(4)) : 1;
      stored.flags =
        (INLINE_SAFE_MIME.has(mime) ? FILE_FLAGS.INLINE_SAFE : 0) |
        FILE_FLAGS.PROBED |
        (applied ? FILE_FLAGS.COMPRESSED : 0);
      stored.state = "ready";
      await stored.save();

      await StorageController.reconcile(userId, storedSize - reserved);
      reservationHeld = false;

      // The chain of custody, for every variant: what was stored, when, how big
      // and under which checksum. Recorded on the append-only Activity model,
      // and keyed on the file id so it survives the file itself.
      await ActivityController.record({
        todoId: scopeKind === "todo" ? refId : null,
        ownerId: userId,
        action: "file.stored",
        field: "attachment",
        to: filename,
        meta: {
          fileId: String(stored._id),
          filename,
          mime,
          kind,
          sizeBytes: storedSize,
          checksum,
          scopeKind,
          scopeId: refId ? String(refId) : null,
        },
      });

      jobRegistry.finish(jobId, { fileId: stored._id, state: "ready" });
      return stored;
    } catch (error) {
      if (stored) {
        await deleteBytes(stored.gridfsId).catch(() => {});
        await StoredFile.updateOne(
          { _id: stored._id },
          { $set: { state: "failed", error: String(error.message).slice(0, 300), gridfsId: null } }
        );
      }
      if (reservationHeld) await StorageController.release(userId, reserved);
      jobRegistry.finish(jobId, { state: "failed", error: String(error.message).slice(0, 300) });
      throw error;
    } finally {
      await unlinkQuietly(destination);
      await unlinkQuietly(compressedPath);
    }
  }

  /** Stream a file on disk into the bucket, resolving to its GridFS id. */
  static writeBytes({ source, stored, onProgress }) {
    return new Promise((resolve, reject) => {
      const uploadStream = getBucket().openUploadStream(stored.filename, {
        contentType: stored.mime,
        metadata: { ownerId: stored.ownerId, storedFileId: stored._id, kind: stored.kind },
      });

      let written = 0;
      const readStream = fs.createReadStream(source);

      readStream.on("data", (chunk) => {
        written += chunk.length;
        if (onProgress) onProgress(written, "store");
      });

      uploadStream.on("error", (error) => {
        readStream.destroy();
        reject(error);
      });
      uploadStream.on("finish", () => resolve(uploadStream.id));
      readStream.on("error", (error) => {
        uploadStream.abort().catch(() => {});
        reject(error);
      });

      readStream.pipe(uploadStream);
    });
  }

  /** The caller's files, newest first, optionally narrowed to one attachment target. */
  static async list({ userId, query = {} }) {
    const filter = { ownerId: userId, state: "ready" };

    if (query.scopeKind) {
      if (!SCOPE_KINDS.includes(query.scopeKind)) throw ApiError.badRequest("Unknown attachment target");
      filter["scope.kind"] = query.scopeKind;
      filter["scope.refId"] = query.scopeId || null;
    }
    if (query.kind) {
      if (!KINDS.includes(query.kind)) throw ApiError.badRequest("Unknown file kind");
      filter.kind = query.kind;
    }

    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const page = Math.max(Number(query.page) || 1, 1);

    const [data, totalRecords] = await Promise.all([
      StoredFile.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StoredFile.countDocuments(filter),
    ]);

    return { data, meta: { totalRecords, page, limit, totalPages: Math.ceil(totalRecords / limit) } };
  }

  /** One file's metadata. Not-yours and not-found are the same 404. */
  static async show({ fileId, userId }) {
    const file = await StoredFile.findOne({ _id: fileId, ownerId: userId });
    if (!file) throw ApiError.notFound("File not found");
    return file;
  }

  /**
   * Stream the bytes back, honouring Range so a browser can seek a video.
   *
   * GridFS's `end` is exclusive while HTTP's is inclusive - the `+ 1` below is
   * the difference between working and silently-truncated media.
   */
  static async stream({ fileId, userId, req, res, download }) {
    const file = await File.show({ fileId, userId });
    if (file.state !== "ready" || !file.gridfsId) throw ApiError.notFound("File not found");

    const size = file.storedSize;
    const etag = `"${file.checksum}"`;
    const inline = !download && (file.flags & FILE_FLAGS.INLINE_SAFE) !== 0;

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", file.mime);
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", file.createdAt.toUTCString());
    // Authorized content: a shared cache must never keep a copy. Immutable is
    // honest because a changed file is always a new id.
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader("Vary", "Cookie");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Overrides helmet's app-wide policy for this one route: these bytes are
    // user-supplied, so they get no privileges at all.
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; ${dispositionFilename(file.filename)}`
    );

    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }

    // A stale If-Range means the client's cached copy is wrong, so send it all.
    const ifRange = req.headers["if-range"];
    const rangeHeader = ifRange && ifRange !== etag ? null : req.headers.range;
    const range = parseRange(rangeHeader, size);

    if (range?.unsatisfiable) {
      res.setHeader("Content-Range", `bytes */${size}`);
      res.status(416).end();
      return;
    }

    const start = range ? range.start : 0;
    const end = range ? range.end : size - 1;

    if (range) {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    } else {
      res.status(200);
    }
    res.setHeader("Content-Length", end - start + 1);

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    // GridFS `end` is exclusive; HTTP `end` is inclusive.
    const downloadStream = getBucket().openDownloadStream(file.gridfsId, { start, end: end + 1 });

    // Without this, every scrub of a video leaks an open cursor.
    res.on("close", () => downloadStream.destroy());
    downloadStream.on("error", () => res.destroy());
    downloadStream.pipe(res);
  }

  /**
   * Delete a file for good.
   *
   * GridFS first, metadata second: the reverse leaves chunks that no query in
   * the application can reach, and that no quota ever credits back.
   */
  static async destroy({ fileId, userId }) {
    const file = await File.show({ fileId, userId });

    await deleteBytes(file.gridfsId);
    await StoredFile.deleteOne({ _id: file._id, ownerId: userId });
    await StorageController.reconcile(userId, -(file.storedSize || 0));

    // The entry that matters most in a custody trail is the one saying the
    // exhibit is gone, so it is written after the bytes actually are.
    await ActivityController.record({
      todoId: file.scope?.kind === "todo" ? file.scope.refId : null,
      ownerId: userId,
      action: "file.deleted",
      field: "attachment",
      from: file.filename,
      meta: {
        fileId: String(file._id),
        filename: file.filename,
        sizeBytes: file.storedSize,
        checksum: file.checksum,
        scopeKind: file.scope?.kind || null,
        scopeId: file.scope?.refId ? String(file.scope.refId) : null,
      },
    });

    return { deleted: true, freedBytes: file.storedSize || 0 };
  }

  /**
   * Drop every file the account owns. Used only when the account itself is
   * being erased, so there is no quota to credit afterwards.
   */
  static async destroyAll(userId) {
    const files = await StoredFile.find({ ownerId: userId }).select("_id gridfsId");
    for (const file of files) {
      await deleteBytes(file.gridfsId).catch(() => {});
    }
    await StoredFile.deleteMany({ ownerId: userId });
    await GeneratedPdf.deleteMany({ ownerId: userId });
    return { deleted: files.length };
  }

  /** Drop every file hanging off a record that is being deleted. */
  static async destroyScope({ kind, refId, userId }) {
    const files = await StoredFile.find({
      ownerId: userId,
      "scope.kind": kind,
      "scope.refId": refId,
    }).select("_id gridfsId storedSize");

    let freed = 0;
    for (const file of files) {
      await deleteBytes(file.gridfsId).catch(() => {});
      freed += file.storedSize || 0;
    }
    if (files.length) {
      await StoredFile.deleteMany({ _id: { $in: files.map((file) => file._id) } });
      await StorageController.reconcile(userId, -freed);
    }

    // Generated PDFs are scoped files like any other, so their bytes have just
    // gone. The version rows that point at them are removed here rather than at
    // each cascade site, so a new cascade cannot forget them and leave a
    // version list referring to files that no longer exist.
    const versions = await GeneratedPdf.deleteMany({
      ownerId: userId,
      "subject.kind": kind,
      "subject.refId": refId,
    });

    return { deleted: files.length, freedBytes: freed, versionsDeleted: versions.deletedCount || 0 };
  }
}

module.exports = { FileController: File, parseRange, assertScopeOwned, SCOPE_KINDS };
