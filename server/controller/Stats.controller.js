const { Todo, Trash } = require("../models");

const STATUSES = ["pending", "progress", "completed"];
const PRIORITIES = ["none", "low", "medium", "high", "urgent"];

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const dayKey = (date) => startOfDay(date).toISOString().slice(0, 10);

/** Fills gaps so the chart has one point per day rather than only active days. */
function buildTrend(days, createdRows, completedRows) {
  const created = new Map(createdRows.map((row) => [row._id, row.value]));
  const completed = new Map(completedRows.map((row) => [row._id, row.value]));

  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = dayKey(date);
    out.push({
      date: key,
      created: created.get(key) || 0,
      completed: completed.get(key) || 0,
    });
  }
  return out;
}

/** Consecutive days, counting back from today, with at least one completion. */
function currentStreak(trend) {
  let streak = 0;
  for (let i = trend.length - 1; i >= 0; i--) {
    if (trend[i].completed > 0) streak++;
    else if (i !== trend.length - 1) break;
    else break;
  }
  return streak;
}

class StatsController {
  /** Everything the analytics page needs, in one round trip. */
  async summary(userId, { days = 30 } = {}) {
    const since = startOfDay();
    since.setDate(since.getDate() - (days - 1));

    const activeScope = { ownerId: userId, archived: false };

    const [totals, statusRows, priorityRows, createdRows, completedRows, tagRows, archived, trashCount] =
      await Promise.all([
        Todo.aggregate([
          { $match: activeScope },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
              pinned: { $sum: { $cond: ["$pinned", 1, 0] } },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$status", "completed"] },
                        { $ne: ["$dueDate", null] },
                        { $lt: ["$dueDate", startOfDay()] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              dueToday: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$status", "completed"] },
                        { $gte: ["$dueDate", startOfDay()] },
                        { $lte: ["$dueDate", endOfDay()] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
        Todo.aggregate([
          { $match: activeScope },
          { $group: { _id: "$status", value: { $sum: 1 } } },
        ]),
        Todo.aggregate([
          { $match: activeScope },
          { $group: { _id: "$priority", value: { $sum: 1 } } },
        ]),
        Todo.aggregate([
          { $match: { ownerId: userId, createdAt: { $gte: since } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, value: { $sum: 1 } } },
        ]),
        Todo.aggregate([
          { $match: { ownerId: userId, completedAt: { $ne: null, $gte: since } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } }, value: { $sum: 1 } } },
        ]),
        Todo.aggregate([
          { $match: { ownerId: userId } },
          { $unwind: "$tags" },
          { $group: { _id: "$tags", value: { $sum: 1 } } },
          { $project: { _id: 0, name: "$_id", value: 1 } },
          { $sort: { value: -1, name: 1 } },
          { $limit: 6 },
        ]),
        Todo.countDocuments({ ownerId: userId, archived: true }),
        Trash.countDocuments({ ownerId: userId }),
      ]);

    const agg = totals[0] || { total: 0, completed: 0, pinned: 0, overdue: 0, dueToday: 0 };
    const statusMap = new Map(statusRows.map((row) => [row._id, row.value]));
    const priorityMap = new Map(priorityRows.map((row) => [row._id, row.value]));
    const completionTrend = buildTrend(days, createdRows, completedRows);

    return {
      summary: {
        total: agg.total,
        completed: agg.completed,
        pending: statusMap.get("pending") || 0,
        progress: statusMap.get("progress") || 0,
        overdue: agg.overdue,
        dueToday: agg.dueToday,
        pinned: agg.pinned,
        archived,
        trashed: trashCount,
        completionRate: agg.total ? Math.round((agg.completed / agg.total) * 100) : 0,
        currentStreak: currentStreak(completionTrend),
      },
      // Zero-filled so the charts keep a stable set of series and colours.
      byStatus: STATUSES.map((name) => ({ name, value: statusMap.get(name) || 0 })),
      byPriority: PRIORITIES.map((name) => ({ name, value: priorityMap.get(name) || 0 })),
      completionTrend,
      topTags: tagRows,
    };
  }
}

module.exports = { StatsController: new StatsController() };
