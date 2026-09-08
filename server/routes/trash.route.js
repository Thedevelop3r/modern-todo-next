const router = require("express").Router();
const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { TrashController } = require("../controller");
const { validate } = require("../middleware");
const { listQuerySchema } = require("../validation/schemas");

router.get(
  "/",
  validate(listQuerySchema, "query"),
  asyncTryCatchWrapper(async (req, res) => {
    const { data, meta } = await TrashController.getTodos(req.validatedQuery, req.user._id);
    res.status(200).json({ data, meta });
  })
);

// Before /:id so "empty" is not read as an id.
router.delete(
  "/",
  asyncTryCatchWrapper(async (req, res) => {
    const result = await TrashController.empty(req.user._id);
    res.status(200).json(result);
  })
);

router.get(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const todo = await TrashController.getTodoById({ todoId: req.params.id, userId: req.user._id });
    res.status(200).json(todo);
  })
);

router.put(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const recovered = await TrashController.recover({ todoId: req.params.id, userId: req.user._id });
    res.status(200).json(recovered);
  })
);

router.delete(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const deleted = await TrashController.destroy({ todoId: req.params.id, userId: req.user._id });
    res.status(200).json(deleted);
  })
);

module.exports = { trashRouter: router };
