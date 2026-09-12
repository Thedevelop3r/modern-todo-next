// storage-sweep.js - the backstop that runs once at boot.
//
// A half-written upload cannot be resumed: the HTTP body that was feeding it is
// gone with the process that died. So rather than pretending, every file left
// mid-flight is marked failed, its bytes are dropped, and the owners whose
// counters it inflated are recomputed. Without this, a crash between reserving
// quota and reconciling it would silently eat an account's allowance forever,
// and the orphaned GridFS chunks would be invisible to every query in the app.

const fs = require("node:fs/promises");
const path = require("node:path");

const { StoredFile } = require("../models");
const { deleteBytes } = require("../utils/gridfs");
const { StorageController } = require("../controller/Storage.controller");

/** Anything still in one of these states at boot was interrupted. */
const IN_FLIGHT = ["pending", "uploading", "compressing", "storing"];

/** Temp files older than this are from a previous run and nothing owns them. */
const TEMP_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const tempDir = () =>
  process.env.UPLOAD_TMP_DIR || path.join(require("node:os").tmpdir(), "modern-todo-uploads");

/** Make sure the scratch directory exists before the first upload needs it. */
async function ensureTempDir() {
  const dir = tempDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function sweepTempFiles() {
  const dir = await ensureTempDir();
  const cutoff = Date.now() - TEMP_MAX_AGE_MS;
  let removed = 0;

  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return 0;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry);
      try {
        const stat = await fs.stat(full);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(full);
          removed += 1;
        }
      } catch {
        // Raced with another sweep, or it was never ours. Either way, leave it.
      }
    })
  );

  return removed;
}

async function sweepInterruptedFiles() {
  const stranded = await StoredFile.find({ state: { $in: IN_FLIGHT } }).select("_id ownerId gridfsId");
  if (!stranded.length) return { files: 0, owners: 0 };

  // GridFS first, metadata second: the reverse orphans chunks that nothing can
  // then find.
  for (const file of stranded) {
    try {
      await deleteBytes(file.gridfsId);
    } catch {
      // A bucket that will not delete must not stop the rest of the sweep.
    }
  }

  await StoredFile.updateMany(
    { _id: { $in: stranded.map((file) => file._id) } },
    { $set: { state: "failed", error: "Interrupted by a server restart", gridfsId: null } }
  );

  const owners = [...new Set(stranded.map((file) => String(file.ownerId)))];
  for (const ownerId of owners) {
    await StorageController.recompute(ownerId);
  }

  return { files: stranded.length, owners: owners.length };
}

/** Called from server.js once the database is connected. */
async function runStorageSweep() {
  const [{ files, owners }, temps] = await Promise.all([sweepInterruptedFiles(), sweepTempFiles()]);
  return { files, owners, temps };
}

module.exports = { runStorageSweep, ensureTempDir, tempDir, TEMP_MAX_AGE_MS, IN_FLIGHT };
