const { Mongoose } = require("../db.config");
const { Schema, model } = Mongoose;

/** A named bucket of todos. A todo belongs to at most one project. */
const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", maxlength: 500 },
    color: {
      type: String,
      enum: ["slate", "red", "orange", "amber", "green", "teal", "sky", "indigo", "violet", "pink"],
      default: "indigo",
    },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    archived: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

projectSchema.index({ ownerId: 1, archived: 1, order: 1 });

const Project = model("Project", projectSchema);

module.exports = { Project };
