const { Activity, Comment, Todo } = require("../models");
const { ApiError } = require("../utils/api-error");

/** Fields whose changes are worth recording on the todo timeline. */
const TRACKED_FIELDS = [
  "title",
  "status",
  "priority",
  "dueDate",
  "startDate",
  "estimate",
  "projectId",
  "archived",
  "pinned",
  "recurrence",
];

class ActivityController {
  /** Fire-and-forget: a logging failure must never fail the user's request. */
  async record(entry) {
    try {
      return await Activity.create(entry);
    } catch (err) {
      console.error("[activity] failed to record", err.message);
      return null;
    }
  }

  /** Diffs a todo before/after an update and records one row per real change. */
  async recordTodoChanges({ todoId, ownerId, before, after }) {
    const entries = [];

    TRACKED_FIELDS.forEach((field) => {
      const from = normalise(before?.[field]);
      const to = normalise(after?.[field]);
      if (from === to) return;
      entries.push({ todoId, ownerId, action: "updated", field, from, to });
    });

    // Subtasks change too often to diff field-by-field; record the tally.
    const beforeDone = (before?.subtasks || []).filter((s) => s.done).length;
    const afterDone = (after?.subtasks || []).filter((s) => s.done).length;
    const beforeCount = (before?.subtasks || []).length;
    const afterCount = (after?.subtasks || []).length;
    if (beforeDone !== afterDone || beforeCount !== afterCount) {
      entries.push({
        todoId,
        ownerId,
        action: "updated",
        field: "subtasks",
        from: `${beforeDone}/${beforeCount}`,
        to: `${afterDone}/${afterCount}`,
      });
    }

    const beforeTags = (before?.tags || []).join(",");
    const afterTags = (after?.tags || []).join(",");
    if (beforeTags !== afterTags) {
      entries.push({ todoId, ownerId, action: "updated", field: "tags", from: beforeTags, to: afterTags });
    }

    if (!entries.length) return [];
    try {
      return await Activity.insertMany(entries);
    } catch (err) {
      console.error("[activity] failed to record changes", err.message);
      return [];
    }
  }

  async forTodo({ todoId, userId, limit = 50 }) {
    return Activity.find({ todoId, ownerId: userId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  /**
   * The chain of custody for one stored file.
   *
   * Every file event is recorded here rather than on a table of its own: the
   * Activity model is already append-only and never edited, which is the only
   * property a custody trail actually needs. Rows are matched on `meta.fileId`
   * so the trail outlives the file - a deletion is the most important entry in
   * it, and a trail that disappeared with the bytes would be worthless.
   */
  async forFile({ fileId, userId, limit = 50 }) {
    return Activity.find({ ownerId: userId, "meta.fileId": String(fileId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async forUser({ userId, limit = 50 }) {
    return Activity.find({ ownerId: userId }).sort({ createdAt: -1 }).limit(limit).lean();
  }
}

class CommentController {
  async list({ todoId, userId }) {
    // Confirms ownership of the parent todo before exposing its comments.
    const todo = await Todo.findOne({ _id: todoId, ownerId: userId }).select("_id").lean();
    if (!todo) throw ApiError.notFound("Todo not found");

    return Comment.find({ todoId, ownerId: userId }).sort({ createdAt: 1 }).lean();
  }

  async create({ todoId, userId, body }) {
    const todo = await Todo.findOne({ _id: todoId, ownerId: userId }).select("_id").lean();
    if (!todo) throw ApiError.notFound("Todo not found");

    const comment = await Comment.create({ todoId, ownerId: userId, body: body.body });
    await ActivityControllerInstance.record({ todoId, ownerId: userId, action: "commented" });
    return comment;
  }

  async update({ commentId, userId, body }) {
    const comment = await Comment.findOneAndUpdate(
      { _id: commentId, ownerId: userId },
      { body: body.body, editedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!comment) throw ApiError.notFound("Comment not found");
    return comment;
  }

  async destroy({ commentId, userId }) {
    const comment = await Comment.findOneAndDelete({ _id: commentId, ownerId: userId });
    if (!comment) throw ApiError.notFound("Comment not found");
    return comment;
  }
}

/** Dates and ids compare cleanly as strings. */
function normalise(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value._bsontype) return String(value);
  if (typeof value === "object") return String(value);
  return value;
}

const ActivityControllerInstance = new ActivityController();

module.exports = {
  ActivityController: ActivityControllerInstance,
  CommentController: new CommentController(),
  TRACKED_FIELDS,
};
