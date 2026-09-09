// User.controller.js

const { User } = require("../models");
const { ApiError } = require("../utils/api-error");
const { SecurityController } = require("./Security.controller");

/**
 * Everything a route may see: no password hash, and none of the 2FA material
 * (the secret and the recovery hashes never leave this file's queries).
 */
const SAFE_SELECT = "-password -twoFactor.secret -twoFactor.pendingSecret -twoFactor.recoveryCodes";

/** A session's lastSeenAt is only worth rewriting once a minute. */
const TOUCH_INTERVAL_MS = 60 * 1000;

class UserController {
  async getAllUsers({ size = 10, page = 1 }) {
    const [users, totalRecords] = await Promise.all([
      User.find()
        .select(SAFE_SELECT)
        .limit(size)
        .skip((page - 1) * size)
        .sort({ createdAt: -1 }),
      User.countDocuments(),
    ]);
    return {
      data: users,
      info: { totalRecords, page, size, totalPages: Math.max(1, Math.ceil(totalRecords / size)) },
    };
  }

  async show(id) {
    const user = await User.findById(id).select(SAFE_SELECT);
    if (!user) throw ApiError.notFound("User not found");
    return user;
  }

  async create(body) {
    const existing = await User.findOne({ email: body.email });
    if (existing) throw ApiError.conflict("That email is already registered");
    const newUser = await User.create(body);
    return newUser.toSafeJSON();
  }

  async update(id, body) {
    // Only these fields are user-editable; email/password/role are not.
    const updates = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.status !== undefined) updates.status = body.status;
    if (body.avatar !== undefined) updates.avatar = body.avatar;

    const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).select(SAFE_SELECT);
    if (!updatedUser) throw ApiError.notFound("User not found");
    return updatedUser;
  }

  async updatePreferences(id, preferences) {
    const user = await User.findById(id).select(SAFE_SELECT);
    if (!user) throw ApiError.notFound("User not found");
    Object.entries(preferences).forEach(([key, value]) => {
      if (value !== undefined) user.preferences[key] = value;
    });
    await user.save();
    return user;
  }

  async changePassword(id, { currentPassword, newPassword }) {
    const user = await User.findById(id);
    if (!user) throw ApiError.notFound("User not found");

    const matches = await user.comparePassword(currentPassword);
    if (!matches) throw ApiError.badRequest("Current password is incorrect");

    user.password = newPassword; // hashed by the pre-save hook
    await user.save();
    return { message: "Password updated" };
  }

  async destroy(id) {
    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) throw ApiError.notFound("User not found");
    return deletedUser;
  }

  /**
   * Three outcomes, deliberately distinct: bad credentials (`user: null`), a
   * correct password that still needs a second factor, and success. The route
   * decides what each one means over HTTP.
   */
  async login({ email, password, code }) {
    const user = await User.findOne({ email });
    if (!user) return { user: null };

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return { user: null };

    if (user.twoFactor?.enabled) {
      if (!code) return { user: null, twoFactorRequired: true, userId: user._id };
      const accepted = await SecurityController.verifySecondFactor(user, code);
      if (!accepted) return { user: null, twoFactorFailed: true, userId: user._id };
    }

    user.lastLoginAt = new Date();
    await user.save();

    return { user };
  }

  /** Changing the password signs every other device out. */
  async revokeOtherSessions(id, keepSessionId) {
    const user = await User.findById(id).select("sessions");
    if (!user) return 0;
    const before = user.sessions.length;
    user.sessions = user.sessions.filter((session) => session.id === keepSessionId);
    await user.save();
    return before - user.sessions.length;
  }

  /**
   * Best-effort "last seen" stamp for the session list. Fire and forget: a
   * failed touch must never fail the request that triggered it.
   */
  static touchSession(id, sessionId) {
    const cutoff = new Date(Date.now() - TOUCH_INTERVAL_MS);
    User.updateOne(
      { _id: id, sessions: { $elemMatch: { id: sessionId, lastSeenAt: { $lt: cutoff } } } },
      { $set: { "sessions.$.lastSeenAt": new Date() } }
    ).catch(() => {});
  }

  static async verifyUser(id) {
    const user = await User.findById(id).select(SAFE_SELECT);
    return user || null;
  }
}

module.exports = { UserController };
