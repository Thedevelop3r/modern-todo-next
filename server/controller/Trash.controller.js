const { Todo, Trash } = require("../models");
const { ApiError } = require("../utils/api-error");
const { FileController } = require("./File.controller");

class TrashController {
  async getTodos(query, userId) {
    const filter = { ownerId: userId };
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(escaped, "i");
      filter.$or = [{ title: rx }, { description: rx }];
    }

    const limit = query.limit || 10;
    const page = query.page || 1;

    const [data, totalRecords] = await Promise.all([
      Trash.find(filter)
        .sort({ deletedAt: -1, _id: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),
      // Scoped to the same filter so the count matches the rows.
      Trash.countDocuments(filter),
    ]);

    return {
      data,
      meta: {
        totalRecords,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
      },
    };
  }

  async getTodoById({ todoId, userId }) {
    const todo = await Trash.findOne({ _id: todoId, ownerId: userId });
    if (!todo) throw ApiError.notFound("Item not found in trash");
    return todo;
  }

  /**
   * Moves an item back into Todo. The trash record's own _id and todoId are
   * dropped so the restored todo gets a clean identity rather than inheriting
   * the trash row's id.
   */
  async recover({ todoId, userId }) {
    const trashed = await Trash.findOneAndDelete({ _id: todoId, ownerId: userId });
    if (!trashed) throw ApiError.notFound("Item not found in trash");

    const { _id, todoId: originalId, deletedAt, createdAt, updatedAt, ...rest } = trashed.toObject();
    return Todo.create({ ...rest, _id: originalId });
  }

  /**
   * Deleting for good is the point at which attachments go too - until now the
   * todo could still be recovered, and its files with it.
   */
  async destroy({ todoId, userId }) {
    const deleted = await Trash.findOneAndDelete({ _id: todoId, ownerId: userId });
    if (!deleted) throw ApiError.notFound("Item not found in trash");

    await FileController.destroyScope({ kind: "todo", refId: deleted.todoId, userId });
    return deleted;
  }

  async empty(userId) {
    const emptied = await Trash.find({ ownerId: userId }).select("todoId");
    for (const item of emptied) {
      await FileController.destroyScope({ kind: "todo", refId: item.todoId, userId });
    }

    const result = await Trash.deleteMany({ ownerId: userId });
    return { deleted: result.deletedCount || 0 };
  }
}

module.exports = { TrashController: new TrashController() };
