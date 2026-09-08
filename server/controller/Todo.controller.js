const { Todo, Trash } = require("../models");
const { ApiError } = require("../utils/api-error");

/** Priority sorting needs a numeric rank; Mongo cannot order an enum string. */
const PRIORITY_RANK = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

class TodoController {
  /**
   * Builds the Mongo filter for a list request. Every query is scoped to
   * ownerId - a user must never be able to widen it.
   */
  buildFilter(query, userId) {
    const filter = { ownerId: userId };

    filter.archived = query.archived === undefined ? false : query.archived;
    if (query.pinned !== undefined) filter.pinned = query.pinned;
    if (query.status?.length) filter.status = { $in: query.status };
    if (query.priority?.length) filter.priority = { $in: query.priority };
    if (query.tags?.length) filter.tags = { $all: query.tags };

    if (query.q) {
      // Regex rather than $text so partial words match while the user types.
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(escaped, "i");
      filter.$or = [{ title: rx }, { description: rx }, { tags: rx }];
    }

    switch (query.due) {
      case "overdue":
        filter.dueDate = { $ne: null, $lt: startOfToday() };
        filter.status = { ...(filter.status || {}), $ne: "completed" };
        break;
      case "today":
        filter.dueDate = { $gte: startOfToday(), $lte: endOfToday() };
        break;
      case "week": {
        const weekEnd = new Date(endOfToday());
        weekEnd.setDate(weekEnd.getDate() + 7);
        filter.dueDate = { $gte: startOfToday(), $lte: weekEnd };
        break;
      }
      case "none":
        filter.dueDate = null;
        break;
      default:
        break;
    }

    return filter;
  }

  buildSort(query) {
    const direction = query.order === "asc" ? 1 : -1;
    // Pinned todos lead every view regardless of the chosen sort.
    const sort = { pinned: -1 };
    if (query.sort === "priority") {
      sort.priorityRank = direction;
    } else {
      sort[query.sort || "createdAt"] = direction;
    }
    sort._id = -1; // stable tiebreak so pagination cannot repeat a document
    return sort;
  }

  async getTodos(query, userId) {
    const filter = this.buildFilter(query, userId);
    const sort = this.buildSort(query);
    const limit = query.limit || 10;
    const page = query.page || 1;

    const pipeline = [
      { $match: filter },
      { $addFields: { priorityRank: { $switch: { branches: Object.entries(PRIORITY_RANK).map(([k, v]) => ({ case: { $eq: ["$priority", k] }, then: v })), default: 0 } } } },
      { $sort: sort },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { priorityRank: 0 } },
    ];

    const [data, totalRecords] = await Promise.all([
      Todo.aggregate(pipeline),
      // Counted against the SAME filter, so totals match what the user can see.
      Todo.countDocuments(filter),
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
    const todo = await Todo.findOne({ _id: todoId, ownerId: userId });
    if (!todo) throw ApiError.notFound("Todo not found");
    return todo;
  }

  async create({ body, userId }) {
    const payload = { ...body, ownerId: userId };
    if (payload.status === "completed") payload.completedAt = new Date();
    // New todos lead the manual order.
    const first = await Todo.findOne({ ownerId: userId }).sort({ order: 1 }).select("order").lean();
    payload.order = (first?.order ?? 0) - 1;
    return Todo.create(payload);
  }

  async update({ todoId, body, userId }) {
    const todo = await Todo.findOne({ _id: todoId, ownerId: userId });
    if (!todo) throw ApiError.notFound("Todo not found");

    const wasCompleted = todo.status === "completed";
    Object.entries(body).forEach(([key, value]) => {
      if (value !== undefined) todo[key] = value;
    });
    await todo.save();

    // Completing a recurring todo spawns the next occurrence.
    if (!wasCompleted && todo.status === "completed" && todo.recurrence !== "none") {
      await this.spawnRecurrence(todo);
    }

    return todo;
  }

  /** Creates the next occurrence of a recurring todo, shifting its due date. */
  async spawnRecurrence(todo) {
    const base = todo.dueDate ? new Date(todo.dueDate) : new Date();
    const next = new Date(base);
    if (todo.recurrence === "daily") next.setDate(next.getDate() + 1);
    else if (todo.recurrence === "weekly") next.setDate(next.getDate() + 7);
    else if (todo.recurrence === "monthly") next.setMonth(next.getMonth() + 1);

    return Todo.create({
      title: todo.title,
      description: todo.description,
      ownerId: todo.ownerId,
      status: "pending",
      priority: todo.priority,
      tags: [...todo.tags],
      subtasks: todo.subtasks.map((s) => ({ title: s.title, done: false })),
      dueDate: todo.dueDate ? next : null,
      recurrence: todo.recurrence,
      pinned: todo.pinned,
      order: todo.order,
    });
  }

  async duplicate({ todoId, userId }) {
    const todo = await this.getTodoById({ todoId, userId });
    return Todo.create({
      title: `${todo.title} (copy)`.slice(0, 100),
      description: todo.description,
      ownerId: userId,
      status: "pending",
      priority: todo.priority,
      tags: [...todo.tags],
      subtasks: todo.subtasks.map((s) => ({ title: s.title, done: false })),
      dueDate: todo.dueDate,
      recurrence: todo.recurrence,
      order: todo.order,
    });
  }

  async destroy({ todoId, userId }) {
    const deletedTodo = await Todo.findOneAndDelete({ _id: todoId, ownerId: userId });
    // Check before touching the document - a missing todo is a 404, not a crash.
    if (!deletedTodo) throw ApiError.notFound("Todo not found");

    const { _id, ...rest } = deletedTodo.toObject();
    await Trash.create({ ...rest, todoId: _id, deletedAt: new Date() });
    return deletedTodo;
  }

  /** One round trip for a multi-select action on the dashboard. */
  async bulk({ ids, action, value, userId }) {
    const scope = { _id: { $in: ids }, ownerId: userId };

    if (action === "delete") {
      const todos = await Todo.find(scope);
      if (todos.length) {
        await Trash.insertMany(
          todos.map((todo) => {
            const { _id, ...rest } = todo.toObject();
            return { ...rest, todoId: _id, deletedAt: new Date() };
          })
        );
        await Todo.deleteMany(scope);
      }
      return { modified: todos.length };
    }

    const updates = {
      status: () => ({ status: value, completedAt: value === "completed" ? new Date() : null }),
      priority: () => ({ priority: value }),
      pin: () => ({ pinned: true }),
      unpin: () => ({ pinned: false }),
      archive: () => ({ archived: true }),
      unarchive: () => ({ archived: false }),
    };

    if (action === "tag") {
      const result = await Todo.updateMany(scope, { $addToSet: { tags: value } });
      return { modified: result.modifiedCount };
    }
    if (action === "untag") {
      const result = await Todo.updateMany(scope, { $pull: { tags: value } });
      return { modified: result.modifiedCount };
    }

    const build = updates[action];
    if (!build) throw ApiError.badRequest(`Unsupported bulk action: ${action}`);

    const result = await Todo.updateMany(scope, { $set: build() });
    return { modified: result.modifiedCount };
  }

  /** Persists manual ordering after a drag. */
  async reorder({ ids, userId }) {
    const operations = ids.map((id, index) => ({
      updateOne: { filter: { _id: id, ownerId: userId }, update: { $set: { order: index } } },
    }));
    if (!operations.length) return { modified: 0 };
    const result = await Todo.bulkWrite(operations);
    return { modified: result.modifiedCount || 0 };
  }

  /** Distinct tags with usage counts, for the filter bar and autocomplete. */
  async tags(userId) {
    return Todo.aggregate([
      { $match: { ownerId: userId } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $project: { _id: 0, name: "$_id", count: 1 } },
      { $sort: { count: -1, name: 1 } },
      { $limit: 50 },
    ]);
  }
}

module.exports = { TodoController: new TodoController() };
