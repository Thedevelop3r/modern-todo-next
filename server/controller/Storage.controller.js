// Storage.controller.js - quota accounting for the object store.
//
// mongod runs standalone here, so there are no transactions. Everything below
// is therefore a single-document update on the user, which mongo applies
// atomically: the quota comparison lives in the *filter* of the same update
// that increments the counter, so two uploads racing each other cannot both
// see room that only one of them has.

const { User, StoredFile } = require("../models");
const { ApiError } = require("../utils/api-error");
const { TIERS, PER_FILE_CAPS, capFor, quotaForTier } = require("../config/storage");
const { toObjectId } = require("../utils/objectid");

/** Recompute when the counter has drifted by more than this fraction of the quota. */
const DRIFT_TOLERANCE = 0.01;

class Storage {
  /**
   * Claim `bytes` of the account's allowance before a single byte is written.
   * Returns the user document, or throws 413 when there is no room - which
   * happens before any I/O, so an over-quota upload costs nothing.
   */
  static async reserve(userId, bytes) {
    if (!(bytes > 0)) return null;

    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        $expr: { $lte: [{ $add: ["$storage.usedBytes", bytes] }, "$storage.quotaBytes"] },
      },
      { $inc: { "storage.usedBytes": bytes } },
      { new: true }
    ).select("storage");

    if (!user) throw ApiError.payloadTooLarge("Not enough storage space left in your account");
    return user;
  }

  /**
   * Correct the reservation once the stored size is known. `delta` is usually
   * negative, because compression shrank the file below what we reserved.
   */
  static async reconcile(userId, delta) {
    if (!delta) return;
    await User.updateOne({ _id: userId }, { $inc: { "storage.usedBytes": delta } });
    // A negative counter would be worse than a wrong one - clamp it.
    await User.updateOne(
      { _id: userId, "storage.usedBytes": { $lt: 0 } },
      { $set: { "storage.usedBytes": 0 } }
    );
  }

  /** Hand back a reservation whose upload never completed. */
  static release(userId, bytes) {
    return Storage.reconcile(userId, -Math.abs(bytes || 0));
  }

  /**
   * Rebuild `usedBytes` from the files that actually exist.
   *
   * A crash between reserve and reconcile leaves the counter too high, and
   * nothing else would ever bring it back down, so this is not optional.
   */
  static async recompute(userId) {
    const ownerId = toObjectId(userId);
    if (!ownerId) return 0;

    const [row] = await StoredFile.aggregate([
      { $match: { ownerId, state: "ready" } },
      { $group: { _id: null, total: { $sum: "$storedSize" } } },
    ]);

    const total = row?.total || 0;
    await User.updateOne({ _id: ownerId }, { $set: { "storage.usedBytes": total } });
    return total;
  }

  /**
   * The account's storage summary, self-healing when the counter has drifted.
   */
  static async summary(userId) {
    const user = await User.findById(userId).select("storage");
    if (!user) throw ApiError.notFound("User not found");

    const storage = user.storage || {};
    const quotaBytes = storage.quotaBytes || quotaForTier(storage.tier);

    const [row] = await StoredFile.aggregate([
      { $match: { ownerId: user._id, state: "ready" } },
      { $group: { _id: null, total: { $sum: "$storedSize" }, count: { $sum: 1 } } },
    ]);
    const actual = row?.total || 0;
    let usedBytes = storage.usedBytes || 0;

    if (Math.abs(usedBytes - actual) > quotaBytes * DRIFT_TOLERANCE) {
      await User.updateOne({ _id: user._id }, { $set: { "storage.usedBytes": actual } });
      usedBytes = actual;
    }

    return {
      usedBytes,
      quotaBytes,
      tier: storage.tier || "base",
      perFileTier: storage.perFileTier || "base",
      fileCount: row?.count || 0,
      caps: PER_FILE_CAPS[storage.perFileTier || "base"],
      tiers: Object.values(TIERS),
    };
  }

  /**
   * Change the account's tier. Billing is not wired up - see
   * stripe-integration.txt for where a payment check belongs.
   */
  static async setTier(userId, { tier, perFileTier }) {
    const patch = {};
    if (tier) {
      if (!TIERS[tier]) throw ApiError.badRequest("Unknown storage tier");
      patch["storage.tier"] = tier;
      patch["storage.quotaBytes"] = quotaForTier(tier);
    }
    if (perFileTier) {
      if (!PER_FILE_CAPS[perFileTier]) throw ApiError.badRequest("Unknown per-file tier");
      patch["storage.perFileTier"] = perFileTier;
    }
    if (!Object.keys(patch).length) throw ApiError.badRequest("Nothing to change");

    const user = await User.findByIdAndUpdate(userId, { $set: patch }, { new: true }).select("storage");
    if (!user) throw ApiError.notFound("User not found");

    // Shrinking the quota below what is already stored is allowed; it simply
    // blocks new uploads until the account is back under the line.
    return Storage.summary(userId);
  }

  /** The per-file ceiling this account may use for a given kind. */
  static capForUser(user, kind) {
    return capFor(kind, user?.storage?.perFileTier || "base");
  }
}

module.exports = { StorageController: Storage };
