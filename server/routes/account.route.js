// account.route.js - data ownership and account security, all behind `auth`.

const router = require("express").Router();
const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { AccountController, SecurityController } = require("../controller");
const { validate } = require("../middleware");
const { Tools } = require("../utils/tools");
const { ApiError } = require("../utils/api-error");
const { User: UserModel } = require("../models");
const {
  importSchema,
  exportQuerySchema,
  auditQuerySchema,
  twoFactorCodeSchema,
  passwordConfirmSchema,
  deleteAccountSchema,
} = require("../validation/schemas");

const Account = new AccountController();
const Security = new SecurityController();

/** Sends a generated file as a download rather than an inline JSON body. */
const sendFile = (res, { contentType, body }, name) => {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.status(200).send(body);
};

const stamp = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------- export ----

router.get(
  "/export/todos",
  validate(exportQuerySchema, "query"),
  asyncTryCatchWrapper(async (req, res) => {
    const { format } = req.validatedQuery;
    const file = await Account.exportTodos({ userId: req.user._id, format });

    await SecurityController.record({
      userId: req.user._id,
      action: "export.todos",
      req,
      meta: { format, count: file.count },
    });

    sendFile(res, file, `modern-todo-${stamp()}.${file.extension}`);
  })
);

router.get(
  "/export",
  asyncTryCatchWrapper(async (req, res) => {
    const file = await Account.exportAccount(req.user._id);
    await SecurityController.record({ userId: req.user._id, action: "export.account", req });
    sendFile(res, file, `modern-todo-account-${stamp()}.json`);
  })
);

// ------------------------------------------------------------- import ----

router.post(
  "/import",
  validate(importSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const summary = await Account.importTodos({ userId: req.user._id, ...req.body });

    if (!summary.dryRun) {
      await SecurityController.record({
        userId: req.user._id,
        action: "import.todos",
        req,
        meta: { format: req.body.format, created: summary.created, projects: summary.projectsCreated },
      });
    }

    res.status(200).json(summary);
  })
);

// -------------------------------------------------------- sample data ----

router.post(
  "/sample-data",
  asyncTryCatchWrapper(async (req, res) => {
    const result = await Account.sampleData(req.user._id);
    await SecurityController.record({ userId: req.user._id, action: "sample_data.created", req, meta: result });
    res.status(201).json(result);
  })
);

// ----------------------------------------------------------- sessions ----

router.get(
  "/sessions",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await Security.listSessions({ userId: req.user._id, currentSessionId: req.sessionId }));
  })
);

// Declared before /sessions/:id so "all" is never read as a session id.
router.delete(
  "/sessions/all",
  asyncTryCatchWrapper(async (req, res) => {
    const result = await Security.revokeAllSessions({ userId: req.user._id });
    await SecurityController.record({ userId: req.user._id, action: "sessions.revoked_all", req, meta: result });
    // This device's token is dead too, so do not leave a stale cookie behind.
    Tools.User.RemoveCookie(res);
    res.status(200).json(result);
  })
);

router.delete(
  "/sessions/:id",
  asyncTryCatchWrapper(async (req, res) => {
    const result = await Security.revokeSession({ userId: req.user._id, sessionId: req.params.id });
    await SecurityController.record({
      userId: req.user._id,
      action: "session.revoked",
      req,
      meta: { sessionId: req.params.id },
    });
    if (req.params.id === req.sessionId) Tools.User.RemoveCookie(res);
    res.status(200).json(result);
  })
);

// ---------------------------------------------------------------- 2FA ----

router.post(
  "/2fa/setup",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await Security.startTwoFactor({ userId: req.user._id }));
  })
);

router.post(
  "/2fa/enable",
  validate(twoFactorCodeSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const result = await Security.enableTwoFactor({ userId: req.user._id, code: req.body.code });
    await SecurityController.record({ userId: req.user._id, action: "2fa.enabled", req });
    res.status(200).json(result);
  })
);

router.post(
  "/2fa/disable",
  validate(passwordConfirmSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const result = await Security.disableTwoFactor({ userId: req.user._id, password: req.body.password });
    await SecurityController.record({ userId: req.user._id, action: "2fa.disabled", req });
    res.status(200).json(result);
  })
);

// -------------------------------------------------------------- audit ----

router.get(
  "/audit",
  validate(auditQuerySchema, "query"),
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(await Security.listAudit({ userId: req.user._id, ...req.validatedQuery }));
  })
);

// ------------------------------------------------------------- delete ----

router.delete(
  "/",
  validate(deleteAccountSchema),
  asyncTryCatchWrapper(async (req, res) => {
    // The password is checked here rather than in the controller, so the
    // controller stays a pure "erase everything for this id".
    const user = await UserModel.findById(req.user._id);
    if (!user) throw ApiError.notFound("User not found");
    const matches = await user.comparePassword(req.body.password);
    if (!matches) throw ApiError.badRequest("Password is incorrect");

    const result = await Account.destroyAccount(req.user._id);
    Tools.User.RemoveCookie(res);
    res.status(200).json(result);
  })
);

module.exports = { accountRouter: router };
