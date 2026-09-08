const router = require("express").Router();
const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { TodoController } = require("../controller");
// const { Tools } = require("../utils/tools");

router.get(
  "/",
  asyncTryCatchWrapper(async (req, res) => {
    const { page, limit } = req.query;
    const userId = req.user._id;
    const { data, meta } = await TodoController.getTodos({ page, limit, limit: limit }, userId);
    res.status(200).json({ data, meta });
  })
);

router.get(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id;
    const todo = await TodoController.getTodoById({ todoId: id, userId });
    if (!todo) {
      res.status(404).json({ message: "Todo not found" });
      return;
    }
    res.status(200).json(todo);
  })
);

router.post(
  "/",
  asyncTryCatchWrapper(async (req, res) => {
    const { body } = req;
    const userId = req.user._id;
    const userName = req.user.name;
    const newTodo = await TodoController.create({ body, userId });
    res.status(201).json(newTodo);
  })
);

router.put(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const { id } = req.params;
    const { body } = req;
    const userId = req.user._id;
    const updatedTodo = await TodoController.update({ todoId: id, body, userId });
    if (!updatedTodo) {
      res.status(404).json({ message: "Todo not found" });
      return;
    }
    res.status(200).json(updatedTodo);
  })
);

router.delete(
  "/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id;
    const deletedTodo = await TodoController.destroy({ todoId: id, userId });
    if (!deletedTodo) {
      res.status(404).json({ message: "Todo not found" });
      return;
    }
    res.status(200).json(deletedTodo);
  })
);

module.exports = { todoRouter: router };
