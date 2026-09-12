const router = require("express").Router();
const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { TodoController, CommentController, ActivityController } = require("../controller");
const { validate } = require("../middleware");
const { mountPdfRoutes } = require("./pdf.routes");
const {
  createTodoSchema,
  updateTodoSchema,
  listQuerySchema,
  bulkSchema,
  reorderSchema,
  commentSchema,
} = require("../validation/schemas");

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

// The PDF endpoints, declared before /:id for the same reason as the rest.
mountPdfRoutes(router, "todo");

router.get(
  "/:id/comments",
  asyncTryCatchWrapper(async (req, res) => {
    const comments = await CommentController.list({ todoId: req.params.id, userId: req.user._id });
    res.status(200).json(comments);
  })
);

router.post(
  "/:id/comments",
  validate(commentSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const comment = await CommentController.create({
      todoId: req.params.id,
      userId: req.user._id,
      body: req.body,
    });
    res.status(201).json(comment);
  })
);

router.put(
  "/comments/:commentId",
  validate(commentSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const comment = await CommentController.update({
      commentId: req.params.commentId,
      userId: req.user._id,
      body: req.body,
    });
    res.status(200).json(comment);
  })
);

router.delete(
  "/comments/:commentId",
  asyncTryCatchWrapper(async (req, res) => {
    const comment = await CommentController.destroy({
      commentId: req.params.commentId,
      userId: req.user._id,
    });
    res.status(200).json(comment);
  })
);

router.get(
  "/:id/activity",
  asyncTryCatchWrapper(async (req, res) => {
    const activity = await ActivityController.forTodo({ todoId: req.params.id, userId: req.user._id });
    res.status(200).json(activity);
  })
);

router.post(
  "/:id/timer/start",
  asyncTryCatchWrapper(async (req, res) => {
    const todo = await TodoController.startTimer({ todoId: req.params.id, userId: req.user._id });
    res.status(200).json(todo);
  })
);

router.post(
  "/:id/timer/stop",
  asyncTryCatchWrapper(async (req, res) => {
    const todo = await TodoController.stopTimer({ todoId: req.params.id, userId: req.user._id });
    res.status(200).json(todo);
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
    const newTodo = await TodoController.create({ body: req.body, userId: req.user._id, user: req.user });
    res.status(201).json(newTodo);
  })
);

router.put(
  "/:id",
  validate(updateTodoSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const updatedTodo = await TodoController.update({
      todoId: req.params.id,
      body: req.body,
      userId: req.user._id,
      user: req.user,
    });
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
