// auth.js middleware

const jwt = require("jsonwebtoken");
const { UserController } = require("../controller/User.controller");
const { ApiError } = require("../utils/api-error");

/**
 * Accepts the session cookie or an `Authorization: Bearer` header and attaches
 * the (password-free) user document as req.user.
 */
const auth = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  const cookieToken = req?.cookies?.token;
  const token = authHeader ? authHeader.replace("Bearer ", "") : cookieToken;

  try {
    if (!token) throw ApiError.unauthorized();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await UserController.verifyUser(decoded._id);
    if (!user) throw ApiError.unauthorized();

    // A revoke-all bumps tokenVersion; revoking one device drops its session.
    if ((decoded.tv ?? -1) !== (user.tokenVersion || 0)) throw ApiError.unauthorized();
    if (!decoded.sid || !user.sessions?.some((session) => session.id === decoded.sid)) {
      throw ApiError.unauthorized();
    }

    req.user = user;
    req.token = token;
    req.sessionId = decoded.sid;
    UserController.touchSession(user._id, decoded.sid);
    next();
  } catch (err) {
    // Never leak why the token failed.
    res.status(401).json({ message: "Please authenticate", requestId: req.id });
  }
};

module.exports = { auth };
