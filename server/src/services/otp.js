const crypto = require('crypto');
const config = require('../config');
const OtpCode = require('../models/OtpCode');

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// ---------- Twilio Verify (real SMS) ----------
let verify = null;
if (config.otpProvider === 'twilio') {
  // eslint-disable-next-line global-require
  const twilio = require('twilio');
  const client = twilio(config.twilio.accountSid, config.twilio.authToken);
  verify = client.verify.v2.services(config.twilio.verifyServiceSid);
}

// ---------- Log mode (free testing) ----------
const hash = (phone, code) => crypto.createHmac('sha256', config.jwtSecret).update(`${phone}:${code}`).digest('hex');

async function storeCode(phone) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await OtpCode.findOneAndUpdate(
    { phone },
    { phone, codeHash: hash(phone, code), attempts: 0, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    { upsert: true }
  );
  return code;
}

// ---------- WhatsApp Cloud API (Meta) ----------
// Needs an approved *authentication* template with a one-time-code (copy code) button.
async function sendWhatsAppOtp(phone) {
  const code = await storeCode(phone);
  const { token, phoneNumberId, templateName, templateLang, apiVersion } = config.whatsapp;
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone.replace(/^\+/, ''), // Meta wants digits only
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    await OtpCode.deleteOne({ phone });
    throw new Error(`WhatsApp API ${res.status}: ${(body.error && body.error.message) || 'request failed'}`);
  }
  return 'pending';
}

async function sendLogOtp(phone) {
  const code = await storeCode(phone);
  console.log(`\n========== OTP for ${phone}: ${code} (valid 10 minutes) ==========\n`);
  return 'pending';
}

async function checkLogOtp(phone, code) {
  const entry = await OtpCode.findOne({ phone });
  if (!entry || entry.expiresAt < new Date() || entry.attempts >= MAX_ATTEMPTS) return false;
  const a = Buffer.from(entry.codeHash);
  const b = Buffer.from(hash(phone, code));
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
    await entry.deleteOne();
    return true;
  }
  entry.attempts += 1;
  await entry.save();
  return false;
}

// ---------- Public API ----------
async function sendOtp(phone) {
  if (config.otpProvider === 'whatsapp') return sendWhatsAppOtp(phone);
  if (config.otpProvider !== 'twilio') return sendLogOtp(phone);
  const result = await verify.verifications.create({ to: phone, channel: 'sms' });
  return result.status; // "pending"
}

async function checkOtp(phone, code) {
  // whatsapp + log modes both verify against the locally stored hash
  if (config.otpProvider !== 'twilio') return checkLogOtp(phone, code);
  try {
    const result = await verify.verificationChecks.create({ to: phone, code });
    return result.status === 'approved';
  } catch (err) {
    // 404 = code expired / already used / too many attempts
    if (err && err.status === 404) return false;
    throw err;
  }
}

module.exports = { sendOtp, checkOtp };