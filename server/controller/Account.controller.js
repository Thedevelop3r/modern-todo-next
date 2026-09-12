// Account.controller.js - the user's data as a whole: export, import, seed, erase.

const {
  User,
  Todo,
  Trash,
  Project,
  Comment,
  Activity,
  SavedView,
  Template,
  AuditLog,
} = require("../models");
const { ApiError } = require("../utils/api-error");
const { FileController } = require("./File.controller");
const { applyRichText } = require("../utils/rich-fields");
const { toCsv, parseCsv } = require("../utils/csv");

const STATUSES = ["pending", "progress", "completed"];
const PRIORITIES = ["none", "low", "medium", "high", "urgent"];
const RECURRENCES = ["none", "daily", "weekly", "monthly"];

/** The columns a todo export writes, and an import understands. */
const CSV_COLUMNS = [
  { key: "title", header: "title" },
  { key: "description", header: "description" },
  { key: "status", header: "status" },
  { key: "priority", header: "priority" },
  { key: "tags", header: "tags", get: (todo) => (todo.tags || []).join("|") },
  { key: "dueDate", header: "dueDate", get: (todo) => (todo.dueDate ? todo.dueDate.toISOString() : "") },
  { key: "startDate", header: "startDate", get: (todo) => (todo.startDate ? todo.startDate.toISOString() : "") },
  { key: "estimate", header: "estimate", get: (todo) => (todo.estimate ?? "") },
  { key: "recurrence", header: "recurrence" },
  { key: "pinned", header: "pinned", get: (todo) => (todo.pinned ? "true" : "false") },
  { key: "archived", header: "archived", get: (todo) => (todo.archived ? "true" : "false") },
  { key: "project", header: "project", get: (todo) => todo.projectName || "" },
  {
    key: "subtasks",
    header: "subtasks",
    get: (todo) => (todo.subtasks || []).map((s) => `${s.done ? "[x] " : "[ ] "}${s.title}`).join("|"),
  },
  { key: "createdAt", header: "createdAt", get: (todo) => (todo.createdAt ? todo.createdAt.toISOString() : "") },
];

const truthy = (value) => ["true", "1", "yes", "y"].includes(String(value).trim().toLowerCase());

class AccountController {
  /** Todos with their project name resolved, ready for either export format. */
  async todosForExport(userId) {
    const [todos, projects] = await Promise.all([
      Todo.find({ ownerId: userId }).sort({ createdAt: -1 }).lean(),
      Project.find({ ownerId: userId }).select("_id name").lean(),
    ]);

    const names = new Map(projects.map((project) => [String(project._id), project.name]));
    return todos.map((todo) => ({
      ...todo,
      projectName: todo.projectId ? names.get(String(todo.projectId)) || null : null,
    }));
  }

  async exportTodos({ userId, format = "json" }) {
    const todos = await this.todosForExport(userId);

    if (format === "csv") {
      return { contentType: "text/csv; charset=utf-8", extension: "csv", body: toCsv(todos, CSV_COLUMNS), count: todos.length };
    }

    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        version: 1,
        count: todos.length,
        todos: todos.map(({ ownerId, __v, ...todo }) => todo),
      },
      null,
      2
    );
    return { contentType: "application/json; charset=utf-8", extension: "json", body, count: todos.length };
  }

  /**
   * Everything the account holds, in one file. Secrets are never included -
   * the password hash and the 2FA secret stay in the database.
   */
  async exportAccount(userId) {
    const [user, todos, trash, projects, comments, activity, savedViews, templates, audit] = await Promise.all([
      User.findById(userId).lean(),
      this.todosForExport(userId),
      Trash.find({ ownerId: userId }).lean(),
      Project.find({ ownerId: userId }).lean(),
      Comment.find({ ownerId: userId }).lean(),
      Activity.find({ ownerId: userId }).lean(),
      SavedView.find({ ownerId: userId }).lean(),
      Template.find({ ownerId: userId }).lean(),
      AuditLog.find({ ownerId: userId }).sort({ createdAt: -1 }).limit(500).lean(),
    ]);

    if (!user) throw ApiError.notFound("User not found");

    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        version: 1,
        account: {
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          avatar: user.avatar,
          preferences: user.preferences,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          twoFactorEnabled: Boolean(user.twoFactor?.enabled),
        },
        counts: {
          todos: todos.length,
          trash: trash.length,
          projects: projects.length,
          comments: comments.length,
          activity: activity.length,
          savedViews: savedViews.length,
          templates: templates.length,
        },
        todos,
        trash,
        projects,
        comments,
        activity,
        savedViews,
        templates,
        auditLog: audit,
      },
      null,
      2
    );

    return { contentType: "application/json; charset=utf-8", extension: "json", body };
  }

  /** Turns one raw row (from JSON or CSV) into a todo payload, or an error. */
  normaliseRow(row, index) {
    const issues = [];
    const title = String(row.title ?? "").trim();
    if (!title) issues.push("title is required");
    if (title.length > 100) issues.push("title is longer than 100 characters");

    const status = String(row.status ?? "pending").trim().toLowerCase() || "pending";
    if (!STATUSES.includes(status)) issues.push(`unknown status "${status}"`);

    const priority = String(row.priority ?? "none").trim().toLowerCase() || "none";
    if (!PRIORITIES.includes(priority)) issues.push(`unknown priority "${priority}"`);

    const recurrence = String(row.recurrence ?? "none").trim().toLowerCase() || "none";
    if (!RECURRENCES.includes(recurrence)) issues.push(`unknown recurrence "${recurrence}"`);

    const date = (value) => {
      if (value === undefined || value === null || value === "") return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        issues.push(`"${value}" is not a date`);
        return null;
      }
      return parsed;
    };

    const dueDate = date(row.dueDate);
    const startDate = date(row.startDate);

    const tags = Array.isArray(row.tags)
      ? row.tags
      : String(row.tags ?? "")
          .split(/[|,]/)
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean);

    const subtasks = Array.isArray(row.subtasks)
      ? row.subtasks
          .map((subtask) =>
            typeof subtask === "string"
              ? { title: subtask, done: false }
              : { title: String(subtask?.title ?? "").trim(), done: Boolean(subtask?.done) }
          )
          .filter((subtask) => subtask.title)
      : String(row.subtasks ?? "")
          .split("|")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((entry) => ({
            title: entry.replace(/^\[[ xX]\]\s*/, ""),
            done: /^\[[xX]\]/.test(entry),
          }));

    const estimateRaw = row.estimate;
    let estimate = null;
    if (estimateRaw !== undefined && estimateRaw !== null && String(estimateRaw).trim() !== "") {
      estimate = Number(estimateRaw);
      if (!Number.isFinite(estimate) || estimate < 0) {
        issues.push(`"${estimateRaw}" is not an effort estimate`);
        estimate = null;
      }
    }

    return {
      line: index + 1,
      title,
      issues,
      todo: {
        title: title.slice(0, 100),
        description: String(row.description ?? "").slice(0, 1500),
        status: STATUSES.includes(status) ? status : "pending",
        priority: PRIORITIES.includes(priority) ? priority : "none",
        recurrence: RECURRENCES.includes(recurrence) ? recurrence : "none",
        tags: tags.slice(0, 20),
        subtasks: subtasks.slice(0, 50),
        dueDate,
        startDate,
        estimate,
        pinned: truthy(row.pinned),
        archived: truthy(row.archived),
        projectName: String(row.project ?? row.projectName ?? "").trim() || null,
      },
    };
  }

  /**
   * Import in two phases: `dryRun` reports what *would* happen (valid rows,
   * rejected rows with a reason, and titles that already exist), and the same
   * call without it writes. Nothing is written during a dry run.
   */
  async importTodos({ userId, format = "json", data, dryRun = true, skipDuplicates = true }) {
    let rows;

    if (format === "csv") {
      rows = parseCsv(data);
    } else {
      let parsed;
      try {
        parsed = typeof data === "string" ? JSON.parse(data) : data;
      } catch {
        throw ApiError.badRequest("That is not valid JSON");
      }
      rows = Array.isArray(parsed) ? parsed : parsed?.todos;
      if (!Array.isArray(rows)) throw ApiError.badRequest("Expected an array of todos, or an object with a `todos` array");
    }

    if (!rows.length) throw ApiError.badRequest("There is nothing to import");
    if (rows.length > 1000) throw ApiError.badRequest("Import is limited to 1000 todos at a time");

    const normalised = rows.map((row, index) => this.normaliseRow(row, index));
    const valid = normalised.filter((entry) => !entry.issues.length);
    const invalid = normalised.filter((entry) => entry.issues.length);

    const existing = await Todo.find({ ownerId: userId }).select("title").lean();
    const existingTitles = new Set(existing.map((todo) => todo.title.trim().toLowerCase()));
    const duplicates = valid.filter((entry) => existingTitles.has(entry.title.toLowerCase()));

    const toCreate = skipDuplicates
      ? valid.filter((entry) => !existingTitles.has(entry.title.toLowerCase()))
      : valid;

    const summary = {
      dryRun: Boolean(dryRun),
      total: rows.length,
      valid: valid.length,
      invalid: invalid.length,
      duplicates: duplicates.length,
      willCreate: toCreate.length,
      created: 0,
      projectsCreated: 0,
      rejected: invalid.slice(0, 20).map((entry) => ({ line: entry.line, title: entry.title, issues: entry.issues })),
      preview: toCreate.slice(0, 10).map((entry) => ({
        title: entry.todo.title,
        status: entry.todo.status,
        priority: entry.todo.priority,
        dueDate: entry.todo.dueDate,
        project: entry.todo.projectName,
      })),
    };

    if (dryRun || !toCreate.length) return summary;

    // Projects named in the file are matched by name, and created when missing.
    const projects = await Project.find({ ownerId: userId }).select("_id name").lean();
    const byName = new Map(projects.map((project) => [project.name.toLowerCase(), project._id]));
    const wanted = new Set(
      toCreate.map((entry) => entry.todo.projectName).filter(Boolean).map((name) => name.toLowerCase())
    );

    for (const name of wanted) {
      if (byName.has(name)) continue;
      const original = toCreate.find((entry) => entry.todo.projectName?.toLowerCase() === name).todo.projectName;
      const project = await Project.create({ name: original.slice(0, 60), ownerId: userId });
      byName.set(name, project._id);
      summary.projectsCreated += 1;
    }

    const first = await Todo.findOne({ ownerId: userId }).sort({ order: 1 }).select("order").lean();
    let order = (first?.order ?? 0) - 1;

    const payloads = toCreate.map(({ todo }) => {
      const { projectName, ...rest } = todo;
      order -= 1;
      // An imported row is plaintext; the markup half is derived from it here
      // so an imported todo renders like any other.
      return applyRichText({
        ...rest,
        ownerId: userId,
        order,
        projectId: projectName ? byName.get(projectName.toLowerCase()) || null : null,
        completedAt: rest.status === "completed" ? new Date() : null,
      });
    });

    const created = await Todo.insertMany(payloads, { ordered: false });
    summary.created = created.length;
    return summary;
  }

  /** Seeds a realistic starting point, but only into an empty account. */
  async sampleData(userId) {
    const existing = await Todo.countDocuments({ ownerId: userId });
    if (existing > 0) throw ApiError.conflict("Sample data is only for an empty account");

    const day = (offset) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      return date;
    };

    const [work, home] = await Project.insertMany([
      { name: "Work", color: "indigo", ownerId: userId, order: 0 },
      { name: "Home", color: "green", ownerId: userId, order: 1 },
    ]);

    const todos = [
      {
        title: "Welcome to Modern Todo",
        description: "This is a sample todo. Open it to see comments, activity and subtasks.",
        priority: "medium",
        tags: ["welcome"],
        pinned: true,
        subtasks: [
          { title: "Look around the dashboard", done: true },
          { title: "Try the quick add box", done: false },
          { title: "Press ? for the shortcuts", done: false },
        ],
        dueDate: day(0),
      },
      { title: "Write the weekly update", projectId: work._id, priority: "high", dueDate: day(1), estimate: 3, tags: ["writing"] },
      { title: "Review the pull requests", projectId: work._id, priority: "urgent", dueDate: day(0), status: "progress", estimate: 2 },
      { title: "Plan next quarter", projectId: work._id, priority: "low", startDate: day(3), dueDate: day(10), estimate: 8 },
      { title: "Book the dentist", projectId: home._id, priority: "medium", dueDate: day(-1), tags: ["health"] },
      { title: "Water the plants", projectId: home._id, recurrence: "weekly", dueDate: day(2), tags: ["chores"] },
      { title: "Tidy the garage", projectId: home._id, status: "completed", tags: ["chores"] },
    ];

    const created = await Todo.insertMany(
      todos.map((todo, index) =>
        applyRichText({
          ...todo,
          ownerId: userId,
          order: index,
          completedAt: todo.status === "completed" ? new Date() : null,
        })
      )
    );

    return { todos: created.length, projects: 2 };
  }

  /**
   * Erases the account and everything attached to it. The password is checked
   * by the route before this runs; there is no soft delete and no recovery.
   */
  async destroyAccount(userId) {
    const [todos, trash, projects, comments, activity, savedViews, templates] = await Promise.all([
      Todo.deleteMany({ ownerId: userId }),
      Trash.deleteMany({ ownerId: userId }),
      Project.deleteMany({ ownerId: userId }),
      Comment.deleteMany({ ownerId: userId }),
      Activity.deleteMany({ ownerId: userId }),
      SavedView.deleteMany({ ownerId: userId }),
      Template.deleteMany({ ownerId: userId }),
    ]);

    // Every byte the account stored, and the GridFS chunks behind them.
    const files = await FileController.destroyAll(userId);

    await AuditLog.deleteMany({ ownerId: userId });
    const user = await User.findByIdAndDelete(userId);
    if (!user) throw ApiError.notFound("User not found");

    return {
      message: "Account deleted",
      removed: {
        files: files.deleted,
        todos: todos.deletedCount,
        trash: trash.deletedCount,
        projects: projects.deletedCount,
        comments: comments.deletedCount,
        activity: activity.deletedCount,
        savedViews: savedViews.deletedCount,
        templates: templates.deletedCount,
      },
    };
  }
}

module.exports = { AccountController, CSV_COLUMNS };
