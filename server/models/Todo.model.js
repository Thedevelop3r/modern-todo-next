const { Mongoose } = require("../db.config");
const { Schema, model } = Mongoose;

const subtaskSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 200, trim: true },
    done: { type: Boolean, default: false },
  },
  { _id: true }
);

/**
 * Shared shape for Todo and Trash. Trash adds `todoId`; keeping the rest
 * identical means a todo survives a delete/recover round trip unchanged.
 */
const todoFields = {
  title: {
    required: true,
    type: String,
    maxlength: 100,
    trim: true,
  },
  description: {
    type: String,
    maxlength: 1500,
    default: "",
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ["pending", "progress", "completed"],
    default: "pending",
  },
  priority: {
    type: String,
    enum: ["none", "low", "medium", "high", "urgent"],
    default: "none",
  },
  tags: {
    type: [String],
    default: [],
  },
  subtasks: {
    type: [subtaskSchema],
    default: [],
  },
  dueDate: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  pinned: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  recurrence: {
    type: String,
    enum: ["none", "daily", "weekly", "monthly"],
    default: "none",
  },
};

const todoSchema = new Schema(todoFields, { timestamps: true });

// Query paths the list endpoint actually uses.
todoSchema.index({ ownerId: 1, archived: 1, status: 1 });
todoSchema.index({ ownerId: 1, dueDate: 1 });
todoSchema.index({ ownerId: 1, pinned: -1, order: 1, createdAt: -1 });
todoSchema.index({ title: "text", description: "text" });

/** Keep completedAt in step with status, whichever route did the update. */
todoSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    this.completedAt = this.status === "completed" ? new Date() : null;
  }
  next();
});

const Todo = model("Todo", todoSchema);

module.exports = { Todo, todoFields, subtaskSchema };
