// Router
const router = require("express").Router();
const { userRouter } = require("./user.route");
const { todoRouter } = require("./todo.route");
const { trashRouter } = require("./trash.route");
const { insightsRouter } = require("./stats.route");
const { projectRouter } = require("./project.route");
const { libraryRouter } = require("./library.route");
const { accountRouter } = require("./account.route");
const { fontRouter } = require("./font.route");

const { auth } = require("../middleware");

router.use("/user", userRouter);
router.use("/todo", auth, todoRouter);
router.use("/trash", auth, trashRouter);
router.use("/project", auth, projectRouter);
router.use("/account", auth, accountRouter);
router.use("/fonts", auth, fontRouter);
router.use("/", auth, libraryRouter);
// /stats and /tags both live behind auth on this router.
router.use("/", auth, insightsRouter);

// export
module.exports = { router: router };
