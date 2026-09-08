const router = require("express").Router();
const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { TodoController } = require("../controller");
const { validate } = require("../middleware");
const { createTodoSchema, updateTodoSchema, listQuerySchema, bulkSchema, reorderSchema } = require("../validation/schemas");

router.get(
  "/",
  validate(listQuerySchema, "query"),
  asyncTryCatchWrapper(async (req, res) => {
    const { data, meta } = await TodoController.getTodos(req.validatedQuery, req.user._id);
    res.status(200).json({ data, meta });
  })
);

// Declared before /:id so "bulk" and "reorder" are not read as ids.
router.patch(
  "/bulk",
  validate(bulkSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const result = await TodoController.bulk({ ...req.body, userId: req.user._id });
    res.status(200).json(result);
  })
);

router.put(
  "/reorder",
  validate(reorderSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const result = await TodoController.reorder({ ids: req.body.ids, userId: req.user._id });
    res.status(200).json(result);
  })
);

router.post(
  "/:id/duplicate",
  asyncTryCatchWrapper(async (req, res) => {
    const todo = await TodoController.duplicate({ todoId: req.params.id, userId: req.user._id });
    res.status(201).json(todo);
  })
);

router.get(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const todo = await TodoController.getTodoById({ todoId: req.params.id, userId: req.user._id });
    res.status(200).json(todo);
  })
);

router.post(
  "/",
  validate(createTodoSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const newTodo = await TodoController.create({ body: req.body, userId: req.user._id });
    res.status(201).json(newTodo);
  })
);

router.put(
  "/:id",
  validate(updateTodoSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const updatedTodo = await TodoController.update({ todoId: req.params.id, body: req.body, userId: req.user._id });
    res.status(200).json(updatedTodo);
  })
);

router.delete(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const deletedTodo = await TodoController.destroy({ todoId: req.params.id, userId: req.user._id });
    res.status(200).json(deletedTodo);
  })
);

module.exports = { todoRouter: router };
