// User.controller.js

const { User } = require("../models");
const { ApiError } = require("../utils/api-error");

class UserController {
  async getAllUsers({ size = 10, page = 1 }) {
    const [users, totalRecords] = await Promise.all([
      User.find()
        .select("-password")
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
    const user = await User.findById(id).select("-password");
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

    const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).select("-password");
    if (!updatedUser) throw ApiError.notFound("User not found");
    return updatedUser;
  }

  async updatePreferences(id, preferences) {
    const user = await User.findById(id).select("-password");
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

  async login({ email, password }) {
    const user = await User.findOne({ email });
    if (!user) return null;

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return null;

    user.lastLoginAt = new Date();
    await user.save();

    return user.toSafeJSON();
  }

  static async verifyUser(id) {
    const user = await User.findById(id).select("-password");
    return user || null;
  }
}

module.exports = { UserController };
