// User.model.js

const bcrypt = require("bcrypt");
const { Mongoose } = require("../db.config");
const THEME_IDS = require("../../shared/themes.json").map((theme) => theme.id);
const { Schema, model } = Mongoose;

const preferencesSchema = new Schema(
  {
    theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
    /** Which palette. Light/dark above stays orthogonal - every theme has both. */
    themeId: { type: String, enum: THEME_IDS, default: "indigo" },
    /** A Google Fonts family, proxied by /api/fonts. "" means the built-in Inter. */
    fontFamily: { type: String, default: "", maxlength: 64 },
    defaultView: { type: String, enum: ["list", "grid", "board", "calendar", "table"], default: "list" },
    pageSize: { type: Number, min: 5, max: 100, default: 10 },
    density: { type: String, enum: ["comfortable", "compact"], default: "comfortable" },
    /** Root font size: everything is rem-based, so this scales the whole UI. */
    uiScale: { type: String, enum: ["xs", "small", "normal", "large", "xl"], default: "normal" },
  },
  { _id: false }
);

/**
 * One logged-in device. The JWT carries the session id, so revoking a row here
 * makes that specific token stop working without touching the others.
 */
const sessionSchema = new Schema(
  {
    id: { type: String, required: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "", maxlength: 300 },
    createdAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const twoFactorSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    /** Base32 secret, live only once 2FA is enabled. */
    secret: { type: String, default: null },
    /** Secret being set up, promoted to `secret` when the first code verifies. */
    pendingSecret: { type: String, default: null },
    /** SHA-256 hashes - a recovery code is shown once and never stored in clear. */
    recoveryCodes: { type: [String], default: [] },
    enabledAt: { type: Date, default: null },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 50 },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 6,
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    avatar: { type: String, default: "initials", maxlength: 64 },
    preferences: { type: preferencesSchema, default: () => ({}) },
    lastLoginAt: { type: Date, default: null },
    /** Bumped to invalidate every token at once ("revoke all sessions"). */
    tokenVersion: { type: Number, default: 0 },
    sessions: { type: [sessionSchema], default: [] },
    twoFactor: { type: twoFactorSchema, default: () => ({}) },
  },
  { timestamps: true }
);

// comparePassword
userSchema.methods.comparePassword = async function (password) {
  const isMatch = await bcrypt.compare(password, this.password);
  return isMatch;
};

// hash password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(this.password, salt);
  this.password = hash;
  next();
});

/** Never let the hash leave the process. */
userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject({ versionKey: false });
  delete obj.password;
  // The 2FA secrets never leave the process; only the flag does.
  obj.twoFactor = { enabled: Boolean(obj.twoFactor?.enabled), enabledAt: obj.twoFactor?.enabledAt || null };
  return obj;
};

const User = model("User", userSchema);

module.exports = { User };
