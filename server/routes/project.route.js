const router = require("express").Router();
const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { ProjectController } = require("../controller");
const { validate } = require("../middleware");
const { projectSchema, projectUpdateSchema, reorderSchema } = require("../validation/schemas");

router.get(
  "/",
  asyncTryCatchWrapper(async (req, res) => {
    const projects = await ProjectController.list(req.user._id, {
      includeArchived: req.query.archived === "true",
    });
    res.status(200).json(projects);
  })
);

// Before /:id so "reorder" is not read as an id.
router.put(
  "/reorder",
  validate(reorderSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const result = await ProjectController.reorder(req.body.ids, req.user._id);
    res.status(200).json(result);
  })
);

router.post(
  "/",
  validate(projectSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const project = await ProjectController.create(req.body, req.user._id);
    res.status(201).json(project);
  })
);

router.get(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const project = await ProjectController.show(req.params.id, req.user._id);
    res.status(200).json(project);
  })
);

router.put(
  "/:id",
  validate(projectUpdateSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const project = await ProjectController.update(req.params.id, req.body, req.user._id);
    res.status(200).json(project);
  })
);

router.delete(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const result = await ProjectController.destroy(req.params.id, req.user._id);
    res.status(200).json(result);
  })
);

module.exports = { projectRouter: router };
