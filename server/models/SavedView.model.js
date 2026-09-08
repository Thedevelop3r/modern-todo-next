const { Mongoose } = require("../db.config");
const { Schema, model } = Mongoose;

/**
 * A named filter preset. `query` is stored as a plain object and replayed into
 * the dashboard's URL, so a saved view is exactly a shareable filter.
 */
const savedViewSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    query: { type: Schema.Types.Mixed, default: {} },
    icon: { type: String, default: "bookmark", maxlength: 32 },
    pinned: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

savedViewSchema.index({ ownerId: 1, order: 1 });

const SavedView = model("SavedView", savedViewSchema);

module.exports = { SavedView };
