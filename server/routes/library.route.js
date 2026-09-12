const router = require("express").Router();
const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { SavedViewController, TemplateController, TagController } = require("../controller");
const { validate } = require("../middleware");
const {
  savedViewSchema,
  savedViewUpdateSchema,
  templateSchema,
  templateUpdateSchema,
  templateFromTodoSchema,
  tagRenameSchema,
  tagMergeSchema,
} = require("../validation/schemas");

// ---- saved views ----

router.get(
  "/view",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await SavedViewController.list(req.user._id));
  })
);

router.post(
  "/view",
  validate(savedViewSchema),
  asyncTryCatchWrapper(async (req, res) => {
    res.status(201).json(await SavedViewController.create(req.body, req.user._id));
  })
);

router.put(
  "/view/:id",
  validate(savedViewUpdateSchema),
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await SavedViewController.update(req.params.id, req.body, req.user._id));
  })
);

router.delete(
  "/view/:id",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await SavedViewController.destroy(req.params.id, req.user._id));
  })
);

// ---- templates ----

router.get(
  "/template",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await TemplateController.list(req.user._id));
  })
);

router.post(
  "/template",
  validate(templateSchema),
  asyncTryCatchWrapper(async (req, res) => {
    res.status(201).json(await TemplateController.create(req.body, req.user._id, req.user));
  })
);

// Before /template/:id so "from-todo" is not read as an id.
router.post(
  "/template/from-todo",
  validate(templateFromTodoSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const template = await TemplateController.createFromTodo({ ...req.body, userId: req.user._id });
    res.status(201).json(template);
  })
);

router.post(
  "/template/:id/use",
  asyncTryCatchWrapper(async (req, res) => {
    const todo = await TemplateController.instantiate({ templateId: req.params.id, userId: req.user._id });
    res.status(201).json(todo);
  })
);

router.put(
  "/template/:id",
  validate(templateUpdateSchema),
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await TemplateController.update(req.params.id, req.body, req.user._id, req.user));
  })
);

router.delete(
  "/template/:id",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await TemplateController.destroy(req.params.id, req.user._id));
  })
);

// ---- tag maintenance ----

router.put(
  "/tags/rename",
  validate(tagRenameSchema),
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await TagController.rename({ ...req.body, userId: req.user._id }));
  })
);

router.put(
  "/tags/merge",
  validate(tagMergeSchema),
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await TagController.merge({ ...req.body, userId: req.user._id }));
  })
);

router.delete(
  "/tags/:tag",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await TagController.destroy({ tag: req.params.tag, userId: req.user._id }));
  })
);

module.exports = { libraryRouter: router };
