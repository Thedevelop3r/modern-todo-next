// Security.controller.js - sessions, two-factor auth and the account audit log.

const crypto = require("crypto");
const { User, AuditLog } = require("../models");
const { ApiError } = require("../utils/api-error");
const {
  generateSecret,
  verifyCode,
  otpauthUri,
  hashRecoveryCode,
  generateRecoveryCodes,
} = require("../utils/totp");

/** Oldest sessions are dropped past this, so the list stays meaningful. */
const MAX_SESSIONS = 10;

const clientIp = (req) =>
  String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || req?.ip || "";

class SecurityController {
  /**
   * Writes an audit row. Never throws into the caller: a failed log must not
   * fail the action it was describing.
   */
  static async record({ userId, action, req, meta = {} }) {
    try {
      await AuditLog.create({
        ownerId: userId,
        action,
        ip: clientIp(req),
        userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 300),
        meta,
      });
    } catch {
      /* the audit log is best-effort by design */
    }
  }

  async listAudit({ userId, page = 1, limit = 25 }) {
    const [entries, totalRecords] = await Promise.all([
      AuditLog.find({ ownerId: userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments({ ownerId: userId }),
    ]);

    return {
      data: entries,
      meta: { page, limit, totalRecords, totalPages: Math.max(1, Math.ceil(totalRecords / limit)) },
    };
  }

  // ------------------------------------------------------------ sessions ----

  /** Records a new device and returns the id the token will carry. */
  static async createSession({ user, req }) {
    const id = crypto.randomUUID();
    const session = {
      id,
      ip: clientIp(req),
      userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 300),
      createdAt: new Date(),
      lastSeenAt: new Date(),
    };

    user.sessions = [...(user.sessions || []), session].slice(-MAX_SESSIONS);
    await user.save();
    return id;
  }

  async listSessions({ userId, currentSessionId }) {
    const user = await User.findById(userId).select("sessions").lean();
    if (!user) throw ApiError.notFound("User not found");

    return (user.sessions || [])
      .map((session) => ({ ...session, current: session.id === currentSessionId }))
      .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
  }

  async revokeSession({ userId, sessionId }) {
    const user = await User.findById(userId).select("sessions");
    if (!user) throw ApiError.notFound("User not found");

    const before = user.sessions.length;
    user.sessions = user.sessions.filter((session) => session.id !== sessionId);
    if (user.sessions.length === before) throw ApiError.notFound("Session not found");

    await user.save();
    return { message: "Session revoked", remaining: user.sessions.length };
  }

  /**
   * Revoking everything bumps `tokenVersion`, which every existing token
   * carries - so tokens issued before this moment stop verifying, including
   * any the current device holds.
   */
  async revokeAllSessions({ userId }) {
    const user = await User.findById(userId).select("sessions tokenVersion");
    if (!user) throw ApiError.notFound("User not found");

    const revoked = user.sessions.length;
    user.sessions = [];
    user.tokenVersion += 1;
    await user.save();

    return { message: "All sessions revoked", revoked, tokenVersion: user.tokenVersion };
  }

  // ----------------------------------------------------------------- 2FA ----

  /** Step one: hand out a secret. Nothing is enabled until a code verifies. */
  async startTwoFactor({ userId }) {
    const user = await User.findById(userId).select("email twoFactor");
    if (!user) throw ApiError.notFound("User not found");
    if (user.twoFactor?.enabled) throw ApiError.conflict("Two-factor authentication is already on");

    const secret = generateSecret();
    user.twoFactor.pendingSecret = secret;
    await user.save();

    return { secret, otpauthUri: otpauthUri({ secret, email: user.email }) };
  }

  /** Step two: the first correct code turns it on and mints recovery codes. */
  async enableTwoFactor({ userId, code }) {
    const user = await User.findById(userId).select("twoFactor");
    if (!user) throw ApiError.notFound("User not found");
    if (user.twoFactor?.enabled) throw ApiError.conflict("Two-factor authentication is already on");

    const secret = user.twoFactor?.pendingSecret;
    if (!secret) throw ApiError.badRequest("Start the setup first");
    if (!verifyCode(secret, code)) throw ApiError.badRequest("That code is not right - check the clock on your device");

    const recoveryCodes = generateRecoveryCodes();
    user.twoFactor.secret = secret;
    user.twoFactor.pendingSecret = null;
    user.twoFactor.enabled = true;
    user.twoFactor.enabledAt = new Date();
    user.twoFactor.recoveryCodes = recoveryCodes.map(hashRecoveryCode);
    await user.save();

    // The only time the plain codes exist outside the user's hands.
    return { message: "Two-factor authentication is on", recoveryCodes };
  }

  async disableTwoFactor({ userId, password }) {
    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound("User not found");
    if (!user.twoFactor?.enabled) throw ApiError.badRequest("Two-factor authentication is not on");

    const matches = await user.comparePassword(password);
    if (!matches) throw ApiError.badRequest("Password is incorrect");

    user.twoFactor.enabled = false;
    user.twoFactor.secret = null;
    user.twoFactor.pendingSecret = null;
    user.twoFactor.recoveryCodes = [];
    user.twoFactor.enabledAt = null;
    await user.save();

    return { message: "Two-factor authentication is off" };
  }

  /**
   * Checks a login's second factor: a TOTP code, or one recovery code, which is
   * consumed on use. Mutates and saves the user when a recovery code is spent.
   */
  static async verifySecondFactor(user, code) {
    if (verifyCode(user.twoFactor?.secret, code)) return true;

    const hash = hashRecoveryCode(code);
    const remaining = (user.twoFactor?.recoveryCodes || []).filter((stored) => stored !== hash);
    if (remaining.length === (user.twoFactor?.recoveryCodes || []).length) return false;

    user.twoFactor.recoveryCodes = remaining;
    await user.save();
    return true;
  }
}

module.exports = { SecurityController };
