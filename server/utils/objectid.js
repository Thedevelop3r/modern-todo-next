// objectid.js - id casting for aggregation pipelines.
//
// $match does NOT cast strings to ObjectId the way find() does, so any id that
// reaches a pipeline has to be cast by hand or it silently matches nothing.

const { Mongoose } = require("../db.config");

const toObjectId = (value) => {
  if (value instanceof Mongoose.Types.ObjectId) return value;
  try {
    return new Mongoose.Types.ObjectId(String(value));
  } catch {
    return null;
  }
};

module.exports = { toObjectId };
