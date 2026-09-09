const router = require("express").Router();
const jwt = require("jsonwebtoken");
const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { UserController, SecurityController } = require("../controller");
const { Tools } = require("../utils/tools");
const { auth, validate, loginLimiter, registerLimiter } = require("../middleware");
const { ApiError } = require("../utils/api-error");
const {
  registerSchema,
  loginSchema,
  profileSchema,
  preferencesSchema,
  changePasswordSchema,
} = require("../validation/schemas");

const User = new UserController();
const Security = new SecurityController();

router.post(
  "/register",
  registerLimiter,
  validate(registerSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const newUser = await User.create(req.body);
    res.status(201).json(newUser);
  })
);

router.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const { user, userId, twoFactorRequired, twoFactorFailed } = await User.login(req.body);

    // The password was right but the account wants a code: not an error, a step.
    if (twoFactorRequired) return res.status(200).json({ twoFactorRequired: true });
    if (twoFactorFailed) {
      await SecurityController.record({ userId, action: "login.2fa_failed", req });
      throw ApiError.badRequest("That code is not right");
    }
    // Same message either way - do not reveal whether the email exists.
    if (!user) throw ApiError.badRequest("Invalid email or password");

    const sessionId = await SecurityController.createSession({ user, req });
    const token = Tools.User.generateToken(user, sessionId);
    Tools.User.setCookie(res, token);
    await SecurityController.record({ userId: user._id, action: "login", req, meta: { sessionId } });
    res.status(200).json(user.toSafeJSON());
  })
);

router.get(
  "/me",
  auth,
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json(req.user);
  })
);

router.put(
  "/update",
  auth,
  validate(profileSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const user = await User.update(req.user._id, req.body);
    res.status(200).json(user);
  })
);

router.put(
  "/preferences",
  auth,
  validate(preferencesSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const user = await User.updatePreferences(req.user._id, req.body);
    res.status(200).json(user);
  })
);

router.put(
  "/password",
  auth,
  validate(changePasswordSchema),
  asyncTryCatchWrapper(async (req, res) => {
    const result = await User.changePassword(req.user._id, req.body);
    // A password change is only meaningful if it evicts the other devices.
    const revoked = await User.revokeOtherSessions(req.user._id, req.sessionId);
    await SecurityController.record({
      userId: req.user._id,
      action: "password.changed",
      req,
      meta: { sessionsRevoked: revoked },
    });
    res.status(200).json({ ...result, sessionsRevoked: revoked });
  })
);

router.post(
  "/logout",
  asyncTryCatchWrapper(async (req, res) => {
    // Best effort: drop this device's session row if the cookie still parses.
    try {
      const token = req?.cookies?.token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await Security.revokeSession({ userId: decoded._id, sessionId: decoded.sid }).catch(() => {});
        await SecurityController.record({ userId: decoded._id, action: "logout", req });
      }
    } catch {
      /* an expired or forged cookie just gets cleared */
    }

    Tools.User.RemoveCookie(res);
    res.status(200).json({ message: "Logout success" });
  })
);

module.exports = { userRouter: router };
