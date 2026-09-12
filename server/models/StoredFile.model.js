const { Mongoose } = require("../db.config");
const { KINDS } = require("../config/storage");
const { Schema, model } = Mongoose;

/**
 * What a stored file is attached to. `refId` is null for the personal drive,
 * where a file belongs to the account rather than to any one record.
 */
const scopeSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ["todo", "project", "template", "user", "variant"],
      required: true,
    },
    refId: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const compressionSchema = new Schema(
  {
    requested: { type: Boolean, default: false },
    applied: { type: Boolean, default: false },
    /** "sharp/webp", "ffmpeg/h264-crf23", "qpdf/objstreams", or "none". */
    codec: { type: String, default: "none", maxlength: 40 },
    /** storedSize / originalSize. 1 means compression did not help. */
    ratio: { type: Number, default: 1 },
    /**
     * Why compression was asked for but not applied - the tool was missing,
     * it failed, or re-encoding would have made the file bigger. Without this
     * a declined compression is indistinguishable from one that never ran.
     */
    note: { type: String, default: "", maxlength: 200 },
  },
  { _id: false }
);

/**
 * The addressable record for one file. The GridFS document is an implementation
 * detail - controllers go through this model and never query `files.files`
 * directly, because quota, ownership and lifecycle all live here.
 */
const storedFileSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** Null until the bytes have actually been written to the bucket. */
    gridfsId: { type: Schema.Types.ObjectId, default: null },

    scope: { type: scopeSchema, required: true },
    kind: { type: String, enum: KINDS, required: true },
    source: { type: String, enum: ["upload", "generated"], default: "upload" },

    /** Sanitized for display and download; never the raw client-supplied name. */
    filename: { type: String, required: true, maxlength: 200 },
    /** Always one of our own allowlisted types, never an echoed client header. */
    mime: { type: String, required: true, maxlength: 100 },

    originalSize: { type: Number, required: true, min: 0 },
    storedSize: { type: Number, default: 0, min: 0 },
    /** sha256 of the stored bytes. GridFS no longer computes md5, and this is the ETag. */
    checksum: { type: String, default: "", index: true },

    compression: { type: compressionSchema, default: () => ({}) },

    /** Bit flags from config/storage.js FILE_FLAGS - see the comment there. */
    flags: { type: Number, default: 0 },

    /** Which application variant produced the file, when it was a variant feature. */
    variant: { type: String, default: null, maxlength: 40 },
    /** Ties a file being written to its live progress stream. */
    jobId: { type: String, default: null, index: true },

    state: {
      type: String,
      enum: ["pending", "uploading", "compressing", "storing", "ready", "failed"],
      default: "pending",
      index: true,
    },
    error: { type: String, default: null, maxlength: 300 },

    // Probed metadata, absent until the file has been through its probe step.
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    durationSeconds: { type: Number, default: null },
    pages: { type: Number, default: null },
  },
  { timestamps: true }
);

// The three paths the file endpoints actually query on.
storedFileSchema.index({ ownerId: 1, "scope.kind": 1, "scope.refId": 1, createdAt: -1 });
storedFileSchema.index({ ownerId: 1, state: 1 });
storedFileSchema.index({ ownerId: 1, kind: 1, createdAt: -1 });

const StoredFile = model("StoredFile", storedFileSchema);

module.exports = { StoredFile };
