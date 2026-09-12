const { Project, Todo } = require("../models");
const { ApiError } = require("../utils/api-error");
const { applyRichText } = require("../utils/rich-fields");
const { flattenVariantData, nestVariantData, DEFAULT_VARIANT } = require("../config/variants");
const { FileController } = require("./File.controller");

class ProjectController {
  /** Projects with live todo counts, so the sidebar can show them. */
  async list(userId, { includeArchived = false } = {}) {
    const match = { ownerId: userId };
    if (!includeArchived) match.archived = false;

    const projects = await Project.find(match).sort({ order: 1, createdAt: 1 }).lean();
    if (!projects.length) return [];

    const counts = await Todo.aggregate([
      { $match: { ownerId: userId, archived: false, projectId: { $ne: null } } },
      {
        $group: {
          _id: "$projectId",
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          estimate: { $sum: { $ifNull: ["$estimate", 0] } },
          timeSpent: { $sum: { $ifNull: ["$timeSpent", 0] } },
        },
      },
    ]);

    const byId = new Map(counts.map((row) => [String(row._id), row]));

    return projects.map((project) => {
      const stats = byId.get(String(project._id));
      return {
        ...project,
        todoCount: stats?.total || 0,
        completedCount: stats?.completed || 0,
        estimateTotal: stats?.estimate || 0,
        timeSpentTotal: stats?.timeSpent || 0,
      };
    });
  }

  async show(id, userId) {
    const project = await Project.findOne({ _id: id, ownerId: userId });
    if (!project) throw ApiError.notFound("Project not found");
    return project;
  }

  /** A project's own override wins over the account's preference. */
  variantFor(body, project, user) {
    return (
      (body?.applicationType === undefined ? project?.applicationType : body.applicationType) ||
      user?.preferences?.applicationType ||
      DEFAULT_VARIANT
    );
  }

  async create(body, userId, user) {
    const variantId = this.variantFor(body, null, user);
    const variantData = nestVariantData(body.variantData, { variantId, scope: "project" });
    delete body.variantData;

    const last = await Project.findOne({ ownerId: userId }).sort({ order: -1 }).select("order").lean();
    // A project name is plain text; only its description is formatted.
    const payload = applyRichText({ ...body, ownerId: userId, order: (last?.order ?? -1) + 1 }, ["description"]);
    if (variantData) payload.variantData = variantData;
    return Project.create(payload);
  }

  async update(id, body, userId, user) {
    applyRichText(body, ["description"]);

    const existing = await Project.findOne({ _id: id, ownerId: userId }).select("applicationType").lean();
    if (!existing) throw ApiError.notFound("Project not found");

    // Dot paths so the other variants' data survives; see config/variants.js.
    const variantId = this.variantFor(body, existing, user);
    const variantUpdate = flattenVariantData(body.variantData, { variantId, scope: "project" });
    delete body.variantData;

    const project = await Project.findOneAndUpdate({ _id: id, ownerId: userId }, { ...body, ...variantUpdate }, {
      new: true,
      runValidators: true,
    });
    if (!project) throw ApiError.notFound("Project not found");
    return project;
  }

  /**
   * Deleting a project never deletes its todos - they fall back to "no
   * project", which is far less destructive than a cascade.
   */
  async destroy(id, userId) {
    const project = await Project.findOneAndDelete({ _id: id, ownerId: userId });
    if (!project) throw ApiError.notFound("Project not found");

    const result = await Todo.updateMany({ ownerId: userId, projectId: id }, { $set: { projectId: null } });
    // The todos live on, so only files attached to the project itself go.
    const files = await FileController.destroyScope({ kind: "project", refId: id, userId });

    return { project, unassigned: result.modifiedCount || 0, filesDeleted: files.deleted };
  }

  async reorder(ids, userId) {
    const operations = ids.map((id, index) => ({
      updateOne: { filter: { _id: id, ownerId: userId }, update: { $set: { order: index } } },
    }));
    if (!operations.length) return { modified: 0 };
    const result = await Project.bulkWrite(operations);
    return { modified: result.modifiedCount || 0 };
  }
}

module.exports = { ProjectController: new ProjectController() };
