const router = require("express").Router();
const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { FontController } = require("../controller");
const { fontLimiter } = require("../middleware");

/**
 * The Google Fonts proxy. See Font.controller.js for why the app fetches fonts
 * server-side instead of letting the browser reach fonts.gstatic.com.
 */

router.get(
  "/search",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(FontController.search(req.query.q));
  })
);

router.get(
  "/css",
  fontLimiter,
  asyncTryCatchWrapper(async (req, res) => {
    const css = await FontController.css(req.query.family);
    res.set("Content-Type", "text/css; charset=utf-8");
    // Short: a family's file URLs are stable, but Google does revise them.
    res.set("Cache-Control", "public, max-age=3600");
    res.status(200).send(css);
  })
);

router.get(
  "/file/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const { body, contentType } = await FontController.file(req.params.id);
    res.set("Content-Type", contentType);
    // The id is a hash of the upstream URL, so this response can never change.
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(body);
  })
);

module.exports = { fontRouter: router };
