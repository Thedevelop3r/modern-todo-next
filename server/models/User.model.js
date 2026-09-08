// User.model.js

const bcrypt = require("bcrypt");
const { Mongoose } = require("../db.config");
const { Schema, model } = Mongoose;

const preferencesSchema = new Schema(
  {
    theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
    defaultView: { type: String, enum: ["list", "grid", "board", "calendar"], default: "list" },
    pageSize: { type: Number, min: 5, max: 100, default: 10 },
    density: { type: String, enum: ["comfortable", "compact"], default: "comfortable" },
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
  return obj;
};

const User = model("User", userSchema);

module.exports = { User };
