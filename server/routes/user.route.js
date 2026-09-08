const router = require("express").Router();
const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { UserController } = require("../controller");
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
    const user = await User.login(req.body);
    // Same message either way - do not reveal whether the email exists.
    if (!user) throw ApiError.badRequest("Invalid email or password");

    const token = Tools.User.generateToken(user);
    Tools.User.setCookie(res, token);
    res.status(200).json(user);
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
    res.status(200).json(result);
  })
);

router.post(
  "/logout",
  asyncTryCatchWrapper(async (req, res) => {
    Tools.User.RemoveCookie(res);
    res.status(200).json({ message: "Logout success" });
  })
);

module.exports = { userRouter: router };
