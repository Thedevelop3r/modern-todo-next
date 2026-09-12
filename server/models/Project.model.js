const { Mongoose } = require("../db.config");
const { VARIANT_IDS } = require("../config/variants");
const { Schema, model } = Mongoose;

/** A named bucket of todos. A todo belongs to at most one project. */
const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", maxlength: 40000 },
    descriptionHtml: { type: String, default: "", maxlength: 40000 },
    color: {
      type: String,
      enum: ["slate", "red", "orange", "amber", "green", "teal", "sky", "indigo", "violet", "pink"],
      default: "indigo",
    },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    archived: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    /**
     * Whose letterhead the PDF carries. A real top-level field rather than a
     * variant-specific one, because every variant's header prints it.
     */
    organizationName: { type: String, default: "", trim: true, maxlength: 120 },
    /** See Todo.pdfVersionSeq - allocated by $inc, never by counting. */
    pdfVersionSeq: { type: Number, default: 0, min: 0 },
    /** Overrides the account's variant for this project. null means inherit. */
    applicationType: { type: String, enum: [...VARIANT_IDS, null], default: null },
    /** As on Todo, keyed by variant id and written only as dot paths. */
    variantData: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
);

projectSchema.index({ ownerId: 1, archived: 1, order: 1 });

const Project = model("Project", projectSchema);

module.exports = { Project };
