const { Mongoose } = require("../db.config");
const { Schema, model } = Mongoose;

/**
 * Append-only record of what happened to a todo (and of account events, where
 * todoId is null). Written by the controllers, never edited.
 */
const activitySchema = new Schema(
  {
    todoId: { type: Schema.Types.ObjectId, ref: "Todo", default: null, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, required: true, maxlength: 40 },
    field: { type: String, default: null, maxlength: 40 },
    from: { type: Schema.Types.Mixed, default: null },
    to: { type: Schema.Types.Mixed, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

activitySchema.index({ ownerId: 1, createdAt: -1 });
activitySchema.index({ todoId: 1, createdAt: -1 });

const Activity = model("Activity", activitySchema);

module.exports = { Activity };
