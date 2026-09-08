const jwt = require("jsonwebtoken");

const User = {};

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Session cookie. `Secure` is set in production only, so local HTTP development
 * still works while deployed traffic never sends the token in the clear.
 */
User.setCookie = (res, token) => {
  res.cookie("token", token, {
    expires: new Date(Date.now() + MAX_AGE_MS),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
};

User.RemoveCookie = (res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
};

User.generateToken = (user) => {
  return jwt.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
};

module.exports = { User };
