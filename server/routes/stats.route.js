const router = require("express").Router();
const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { StatsController, TodoController } = require("../controller");

router.get(
  "/stats",
  asyncTryCatchWrapper(async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 90);
    const stats = await StatsController.summary(req.user._id, { days });
    res.status(200).json(stats);
  })
);

router.get(
  "/tags",
  asyncTryCatchWrapper(async (req, res) => {
    const tags = await TodoController.tags(req.user._id);
    res.status(200).json(tags);
  })
);

module.exports = { insightsRouter: router };
