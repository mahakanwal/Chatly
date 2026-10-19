const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const config = require('../config');
const User = require('../models/User');
const { toE164 } = require('../utils/phone');
const { sendOtp, checkOtp } = require('../services/otp');
const { signToken } = require('../middleware/auth');

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many OTP requests. Please try again in 15 minutes.' },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});

const isReviewLogin = (phone) => Boolean(config.review.phone && config.review.code && phone === config.review.phone);

// POST /api/auth/send-otp { phone }
router.post('/send-otp', otpLimiter, async (req, res) => {
  const phone = toE164(req.body.phone);
  if (!phone) return res.status(400).json({ message: 'Enter a valid phone number with country code' });

  if (isReviewLogin(phone)) return res.json({ phone, status: 'pending' });

  try {
    await sendOtp(phone);
    res.json({ phone, status: 'pending' });
  } catch (err) {
    console.error('OTP send error:', err.message);
    res.status(502).json({ message: 'Could not send the code. Check the number and try again.' });
  }
});

// POST /api/auth/verify-otp { phone, code }
router.post('/verify-otp', verifyLimiter, async (req, res) => {
  const phone = toE164(req.body.phone);
  const code = String(req.body.code || '').trim();
  if (!phone || !/^\d{4,10}$/.test(code)) return res.status(400).json({ message: 'Invalid phone or code' });

  let approved = false;
  if (isReviewLogin(phone)) {
    approved = code === config.review.code;
  } else {
    try {
      approved = await checkOtp(phone, code);
    } catch (err) {
      console.error('OTP verify error:', err.message);
      return res.status(502).json({ message: 'Verification failed. Please try again.' });
    }
  }
  if (!approved) return res.status(400).json({ message: 'Incorrect or expired code' });

  let user = await User.findOne({ phone });
  if (!user) user = await User.create({ phone });

  res.json({
    token: signToken(user._id),
    user: user.toSelf(),
    isNewUser: !user.name,
  });
});

module.exports = router;