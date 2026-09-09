const { Mongoose } = require("../db.config");
const { subtaskSchema } = require("./Todo.model");
const { Schema, model } = Mongoose;

/** A reusable todo skeleton. Kept separate from Todo so it never appears in lists. */
const templateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, maxlength: 100 },
    description: { type: String, default: "", maxlength: 1500 },
    priority: {
      type: String,
      enum: ["none", "low", "medium", "high", "urgent"],
      default: "none",
    },
    tags: { type: [String], default: [] },
    subtasks: { type: [subtaskSchema], default: [] },
    estimate: { type: Number, default: null, min: 0, max: 1000 },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    recurrence: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly"],
      default: "none",
    },
    // Days from creation to the due date, rather than a fixed date.
    dueInDays: { type: Number, default: null, min: 0, max: 3650 },
    useCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

templateSchema.index({ ownerId: 1, createdAt: -1 });

const Template = model("Template", templateSchema);

module.exports = { Template };
