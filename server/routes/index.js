// Router
const router = require("express").Router();
const { userRouter } = require("./user.route");
const { todoRouter } = require("./todo.route");
const { trashRouter } = require("./trash.route");
const { insightsRouter } = require("./stats.route");

const { auth } = require("../middleware");

router.use("/user", userRouter);
router.use("/todo", auth, todoRouter);
router.use("/trash", auth, trashRouter);
// /stats and /tags both live behind auth on this router.
router.use("/", auth, insightsRouter);

// export
module.exports = { router: router };
