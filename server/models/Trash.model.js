const { Mongoose } = require("../db.config");
const { todoFields } = require("./Todo.model");
const { Schema, model } = Mongoose;

// Same fields as Todo plus a pointer back to the original document.
const trashSchema = new Schema(
  {
    ...todoFields,
    todoId: {
      type: Schema.Types.ObjectId,
      ref: "Todo",
      required: true,
    },
    deletedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

trashSchema.index({ ownerId: 1, deletedAt: -1 });

const Trash = model("Trash", trashSchema);

module.exports = { Trash };
