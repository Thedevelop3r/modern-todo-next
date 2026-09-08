const { Mongoose } = require("../db.config");
const { Schema, model } = Mongoose;

/** A note attached to a todo. */
const commentSchema = new Schema(
  {
    todoId: { type: Schema.Types.ObjectId, ref: "Todo", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

commentSchema.index({ todoId: 1, createdAt: -1 });

const Comment = model("Comment", commentSchema);

module.exports = { Comment };
