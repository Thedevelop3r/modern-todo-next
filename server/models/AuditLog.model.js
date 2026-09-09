// AuditLog.model.js

const { Mongoose } = require("../db.config");
const { Schema, model } = Mongoose;

/**
 * Account-level security events. Todo edits are tracked separately by
 * `Activity`; this log is about the account itself - who signed in, what was
 * exported, when 2FA changed.
 */
const auditLogSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, required: true, maxlength: 60 },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "", maxlength: 300 },
    /** Free-form context: counts, session ids, formats. Never credentials. */
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ ownerId: 1, createdAt: -1 });

const AuditLog = model("AuditLog", auditLogSchema);

module.exports = { AuditLog };
