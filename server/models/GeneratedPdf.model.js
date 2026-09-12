const { Mongoose } = require("../db.config");
const { Schema, model } = Mongoose;

/**
 * What a rendered PDF was made from. One collection serves todos and projects
 * rather than two near-identical models: every field below is the same for
 * both, and the only thing that differs is which record `refId` points at.
 */
const subjectSchema = new Schema(
  {
    kind: { type: String, enum: ["todo", "project"], required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

/**
 * One version of one rendered document.
 *
 * The bytes live in GridFS behind a `StoredFile` like any other file - this is
 * the versioning record that sits on top: which subject, which version, what it
 * was rendered from and by whom. Deleting the StoredFile without this row would
 * leave a version number pointing at nothing, so the two are always written and
 * deleted together (see Pdf.controller.js).
 */
const generatedPdfSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: subjectSchema, required: true },
    fileId: { type: Schema.Types.ObjectId, ref: "StoredFile", required: true },

    /** Allocated by $inc on the subject, never by counting rows. */
    version: { type: Number, required: true, min: 1 },
    /** Which application variant produced it, and which template it used. */
    variant: { type: String, default: "general", maxlength: 40 },
    template: { type: String, default: "general", maxlength: 40 },

    filename: { type: String, required: true, maxlength: 200 },
    sizeBytes: { type: Number, default: 0, min: 0 },

    /**
     * sha256 of the content that went into the render, with the volatile parts
     * (timestamp, version, request id) left out. Two renders of an unchanged
     * record hash the same, which is what makes "up to date with the current
     * todo" an honest statement rather than a guess.
     */
    snapshotHash: { type: String, default: "", index: true },
    /** The title as it read at render time, so an old version still says so. */
    snapshotTitle: { type: String, default: "", maxlength: 200 },

    generatedBy: {
      userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
      name: { type: String, default: "", maxlength: 120 },
    },
    generatedAt: { type: Date, default: Date.now },
    /** How long the renderer took, in milliseconds. Cheap, and it ages well. */
    renderMs: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// The list endpoint's only query: one subject's versions, newest first.
generatedPdfSchema.index({ ownerId: 1, "subject.kind": 1, "subject.refId": 1, version: -1 });
generatedPdfSchema.index({ ownerId: 1, createdAt: -1 });

const GeneratedPdf = model("GeneratedPdf", generatedPdfSchema);

module.exports = { GeneratedPdf };
