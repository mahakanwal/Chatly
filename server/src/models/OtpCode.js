const { Schema, model } = require('mongoose');

/** One-time codes for OTP_PROVIDER=log (free testing mode). Codes are stored hashed. */
const otpSchema = new Schema({
  phone: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

// MongoDB removes expired codes automatically
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('OtpCode', otpSchema);
