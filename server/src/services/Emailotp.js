const crypto = require('crypto');
const config = require('../config');
const EmailCode = require('../models/Emailcode');
const { sendMail } = require('./mailer');
const { renderOtpEmail } = require('../utils/emailTemplate');

const TTL_MINUTES = 10;
const COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const hash = (email, purpose, code) =>
  crypto.createHash('sha256').update(`${email}:${purpose}:${code}:${config.jwtSecret}`).digest('hex');

const httpError = (status, message) => Object.assign(new Error(message), { status });

/** Creates a fresh 6-digit code, stores its hash, and e-mails it. */
async function issueCode({ email, purpose, name, payload }) {
  const existing = await EmailCode.findOne({ email, purpose });
  if (existing && Date.now() - new Date(existing.sentAt).getTime() < COOLDOWN_MS) {
    throw httpError(429, 'Please wait a minute before asking for another code.');
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const doc = {
    email,
    purpose,
    codeHash: hash(email, purpose, code),
    attempts: 0,
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
  };
  if (payload) doc.payload = payload;
  await EmailCode.findOneAndUpdate({ email, purpose }, doc, { upsert: true });

  const { subject, html, text } = renderOtpEmail({ code, name, purpose, expiresInMinutes: TTL_MINUTES });
  try {
    await sendMail({ to: email, subject, html, text });
  } catch (err) {
    await EmailCode.deleteOne({ email, purpose });
    throw err;
  }
}

/** Re-sends the signup code for a pending signup (keeps the pending account data). */
async function resendVerifyCode(email) {
  const rec = await EmailCode.findOne({ email, purpose: 'verify' });
  if (!rec || !rec.payload) throw httpError(404, 'No pending signup for this email. Please sign up again.');
  await issueCode({ email, purpose: 'verify', name: rec.payload.name, payload: rec.payload });
}

/** Returns the used record (with payload) when the code is right, otherwise null. */
async function checkCode({ email, purpose, code }) {
  const rec = await EmailCode.findOne({ email, purpose });
  if (!rec || new Date(rec.expiresAt) < new Date()) return null;
  if (rec.attempts >= MAX_ATTEMPTS) {
    await EmailCode.deleteOne({ email, purpose });
    return null;
  }
  const a = Buffer.from(hash(email, purpose, code));
  const b = Buffer.from(rec.codeHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    rec.attempts += 1;
    await rec.save();
    return null;
  }
  await EmailCode.deleteOne({ email, purpose });
  return rec;
}

module.exports = { issueCode, resendVerifyCode, checkCode, TTL_MINUTES };