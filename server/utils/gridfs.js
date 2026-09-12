// gridfs.js - access to the one GridFS bucket this application stores bytes in.
//
// The bucket cannot be a module-level constant: db.config.js reads the
// environment at load time and the connection does not exist when this file is
// first required. It is therefore a lazy singleton, keyed on the live
// connection object so the test harness's connect/disconnect cycle gets a fresh
// bucket rather than one pointing at a closed database.

const { Mongoose } = require("../db.config");
const { ApiError } = require("./api-error");

/** One bucket for every kind of file. Chunk size is the driver default, 1 MiB. */
const BUCKET_NAME = "files";
const CHUNK_SIZE = 1 << 20;

let cached = null; // { db, bucket }

function getBucket() {
  const connection = Mongoose.connection;

  if (connection?.readyState !== 1 || !connection.db) {
    throw new ApiError(503, "Storage is unavailable");
  }

  if (cached && cached.db === connection.db) return cached.bucket;

  // Mongoose re-exports the driver, so we do not add `mongodb` as a direct
  // dependency and cannot end up with two copies of it.
  const bucket = new Mongoose.mongo.GridFSBucket(connection.db, {
    bucketName: BUCKET_NAME,
    chunkSizeBytes: CHUNK_SIZE,
  });

  cached = { db: connection.db, bucket };
  return bucket;
}

/**
 * Delete the bytes behind a file, tolerating a missing file.
 *
 * Callers delete from GridFS *before* the StoredFile row: the reverse order
 * orphans chunks that nothing can then find or account for.
 */
async function deleteBytes(gridfsId) {
  if (!gridfsId) return false;
  try {
    await getBucket().delete(gridfsId);
    return true;
  } catch (error) {
    // The driver throws when the id is already gone, which is the state we want.
    if (/FileNotFound|File not found/i.test(error?.message || "")) return false;
    throw error;
  }
}

/** Drops the cached bucket. The test harness calls this between connections. */
function resetBucket() {
  cached = null;
}

module.exports = { getBucket, deleteBytes, resetBucket, BUCKET_NAME, CHUNK_SIZE };
