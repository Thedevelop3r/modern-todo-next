const { SavedView, Template, Todo } = require("../models");
const { ApiError } = require("../utils/api-error");
const { applyRichText } = require("../utils/rich-fields");
const { flattenVariantData, nestVariantData, DEFAULT_VARIANT } = require("../config/variants");

/** Saved filter presets. */
class SavedViewController {
  async list(userId) {
    return SavedView.find({ ownerId: userId }).sort({ order: 1, createdAt: 1 }).lean();
  }

  async create(body, userId) {
    const last = await SavedView.findOne({ ownerId: userId }).sort({ order: -1 }).select("order").lean();
    return SavedView.create({ ...body, ownerId: userId, order: (last?.order ?? -1) + 1 });
  }

  async update(id, body, userId) {
    const view = await SavedView.findOneAndUpdate({ _id: id, ownerId: userId }, body, {
      new: true,
      runValidators: true,
    });
    if (!view) throw ApiError.notFound("Saved view not found");
    return view;
  }

  async destroy(id, userId) {
    const view = await SavedView.findOneAndDelete({ _id: id, ownerId: userId });
    if (!view) throw ApiError.notFound("Saved view not found");
    return view;
  }
}

/** Reusable todo skeletons. */
class TemplateController {
  async list(userId) {
    return Template.find({ ownerId: userId }).sort({ useCount: -1, createdAt: -1 }).lean();
  }

  async create(body, userId, user) {
    const variantId = user?.preferences?.applicationType || DEFAULT_VARIANT;
    const variantData = nestVariantData(body.variantData, { variantId, scope: "todo" });
    delete body.variantData;

    const payload = applyRichText({ ...body, ownerId: userId });
    if (variantData) payload.variantData = variantData;
    return Template.create(payload);
  }

  /** Snapshots an existing todo into a template. */
  async createFromTodo({ todoId, name, userId }) {
    const todo = await Todo.findOne({ _id: todoId, ownerId: userId }).lean();
    if (!todo) throw ApiError.notFound("Todo not found");

    return Template.create({
      ownerId: userId,
      name: name || todo.title,
      // The formatting travels with the snapshot, both halves together.
      title: todo.title,
      titleHtml: todo.titleHtml || "",
      description: todo.description,
      descriptionHtml: todo.descriptionHtml || "",
      priority: todo.priority,
      tags: todo.tags,
      subtasks: (todo.subtasks || []).map((s) => ({ title: s.title, done: false })),
      estimate: todo.estimate,
      projectId: todo.projectId,
      recurrence: todo.recurrence,
      // The variant extras travel with the snapshot; a template of a School
      // todo is worth nothing without its course and term.
      variantData: todo.variantData || {},
    });
  }

  async update(id, body, userId, user) {
    applyRichText(body);

    // Dot paths, never a nested object - the same rule the todo write path
    // follows, and for the same two reasons.
    const variantId = user?.preferences?.applicationType || DEFAULT_VARIANT;
    const variantUpdate = flattenVariantData(body.variantData, { variantId, scope: "todo" });
    delete body.variantData;

    const template = await Template.findOneAndUpdate({ _id: id, ownerId: userId }, { ...body, ...variantUpdate }, {
      new: true,
      runValidators: true,
    });
    if (!template) throw ApiError.notFound("Template not found");
    return template;
  }

  async destroy(id, userId) {
    const template = await Template.findOneAndDelete({ _id: id, ownerId: userId });
    if (!template) throw ApiError.notFound("Template not found");
    return template;
  }

  /** Instantiates a template as a real todo, resolving dueInDays to a date. */
  async instantiate({ templateId, userId }) {
    const template = await Template.findOne({ _id: templateId, ownerId: userId });
    if (!template) throw ApiError.notFound("Template not found");

    let dueDate = null;
    if (template.dueInDays !== null && template.dueInDays !== undefined) {
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + template.dueInDays);
      dueDate.setHours(23, 59, 59, 999);
    }

    const first = await Todo.findOne({ ownerId: userId }).sort({ order: 1 }).select("order").lean();

    const todo = await Todo.create({
      ownerId: userId,
      title: template.title,
      titleHtml: template.titleHtml || "",
      description: template.description,
      descriptionHtml: template.descriptionHtml || "",
      priority: template.priority,
      tags: [...template.tags],
      subtasks: template.subtasks.map((s) => ({ title: s.title, done: false })),
      estimate: template.estimate,
      projectId: template.projectId,
      recurrence: template.recurrence,
      dueDate,
      order: (first?.order ?? 0) - 1,
      // A plain object on insert, which is the one safe place for it - see
      // server/config/variants.js.
      variantData: template.variantData ? JSON.parse(JSON.stringify(template.variantData)) : {},
    });

    template.useCount += 1;
    await template.save();

    return todo;
  }
}

/** Bulk tag maintenance across every todo a user owns. */
class TagController {
  async rename({ from, to, userId }) {
    const source = from.trim().toLowerCase();
    const target = to.trim().toLowerCase();
    if (!source || !target) throw ApiError.badRequest("Both tag names are required");
    if (source === target) return { modified: 0 };

    // Two steps, because $set on an array element cannot also de-duplicate:
    // drop the target where both exist, then rewrite the source in place.
    await Todo.updateMany({ ownerId: userId, tags: { $all: [source, target] } }, { $pull: { tags: target } });
    const result = await Todo.updateMany(
      { ownerId: userId, tags: source },
      { $set: { "tags.$[element]": target } },
      { arrayFilters: [{ element: source }] }
    );

    return { modified: result.modifiedCount || 0 };
  }

  /** Folds several tags into one. */
  async merge({ sources, target, userId }) {
    const clean = sources.map((s) => s.trim().toLowerCase()).filter(Boolean);
    const to = target.trim().toLowerCase();
    if (!clean.length || !to) throw ApiError.badRequest("Sources and a target are required");

    const affected = await Todo.find({ ownerId: userId, tags: { $in: clean } }).select("_id").lean();

    await Todo.updateMany({ ownerId: userId, tags: { $in: clean } }, { $pull: { tags: { $in: clean } } });
    await Todo.updateMany(
      { _id: { $in: affected.map((t) => t._id) }, ownerId: userId },
      { $addToSet: { tags: to } }
    );

    return { modified: affected.length };
  }

  async destroy({ tag, userId }) {
    const name = tag.trim().toLowerCase();
    const result = await Todo.updateMany({ ownerId: userId, tags: name }, { $pull: { tags: name } });
    return { modified: result.modifiedCount || 0 };
  }
}

module.exports = {
  SavedViewController: new SavedViewController(),
  TemplateController: new TemplateController(),
  TagController: new TagController(),
};
