const { Schema, model } = require('mongoose');

/**
 * One-time e-mail codes (signup verification + password reset). Codes are stored hashed.
 * For signups, `payload` holds the pending account (username + password hash) until the code is confirmed.
 */
const emailCodeSchema = new Schema({
  email: { type: String, required: true },
  purpose: { type: String, enum: ['verify', 'reset'], required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  payload: { type: Schema.Types.Mixed },
});

emailCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });
// MongoDB removes expired codes automatically
emailCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('EmailCode', emailCodeSchema);