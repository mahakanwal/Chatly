const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const config = require('../config');
const User = require('../models/User');
const { toE164 } = require('../utils/phone');
const { sendOtp, checkOtp } = require('../services/otp');
const { signToken } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../utils/password');
const { EMAIL_RE, normalizeEmail, normalizeUsername, usernameError, passwordError } = require('../utils/accounts');
const { issueCode, resendVerifyCode, checkCode } = require('../services/emailOtp');

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

const makeLimiter = (limit, message) =>
  rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { message } });
const signupLimiter = makeLimiter(10, 'Too many signup attempts. Please try again in 15 minutes.');
const loginLimiter = makeLimiter(20, 'Too many login attempts. Please try again in 15 minutes.');
const codeLimiter = makeLimiter(8, 'Too many code requests. Please try again in 15 minutes.');

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

// ====================== E-mail accounts ======================

const sendError = (res, err, fallback) => {
  if (err && err.status) return res.status(err.status).json({ message: err.message });
  console.error('E-mail send error:', err && err.message);
  return res.status(502).json({ message: fallback });
};

// GET /api/auth/username-available?username=abc -> { available, message? }
router.get('/username-available', verifyLimiter, async (req, res) => {
  const username = normalizeUsername(req.query.username);
  const problem = usernameError(username);
  if (problem) return res.json({ available: false, message: problem });
  const taken = await User.exists({ username });
  res.json({ available: !taken, message: taken ? 'This username is taken' : '' });
});

// POST /api/auth/signup { email, username, password, name? } -> sends a 6-digit code to the e-mail
router.post('/signup', signupLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim().slice(0, 50) || username;

  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
  const uProblem = usernameError(username);
  if (uProblem) return res.status(400).json({ message: uProblem });
  const pProblem = passwordError(password);
  if (pProblem) return res.status(400).json({ message: pProblem });

  if (await User.exists({ email })) return res.status(409).json({ message: 'This email is already registered. Try logging in.' });
  if (await User.exists({ username })) return res.status(409).json({ message: 'This username is taken' });

  try {
    const passwordHash = await hashPassword(password);
    await issueCode({ email, purpose: 'verify', name, payload: { username, passwordHash, name } });
    res.json({ email, status: 'pending' });
  } catch (err) {
    sendError(res, err, 'Could not send the verification email. Check the address and try again.');
  }
});

// POST /api/auth/resend-code { email } -> sends the signup code again
router.post('/resend-code', codeLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
  try {
    await resendVerifyCode(email);
    res.json({ email, status: 'pending' });
  } catch (err) {
    sendError(res, err, 'Could not send the verification email. Please try again.');
  }
});

// POST /api/auth/verify-email { email, code } -> creates the account and logs in
router.post('/verify-email', verifyLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code || '').trim();
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Invalid email or code' });

  const rec = await checkCode({ email, purpose: 'verify', code });
  if (!rec || !rec.payload) return res.status(400).json({ message: 'Incorrect or expired code' });

  const { username, passwordHash, name } = rec.payload;
  if (await User.exists({ email })) return res.status(409).json({ message: 'This email is already registered. Try logging in.' });
  if (await User.exists({ username })) {
    return res.status(409).json({ message: 'That username was just taken. Please sign up again with another one.' });
  }
  try {
    const user = await User.create({ email, username, passwordHash, name, emailVerified: true });
    res.json({ token: signToken(user._id), user: user.toSelf(), isNewUser: false });
  } catch (err) {
    if (err && err.code === 11000) return res.status(409).json({ message: 'This email or username is already registered.' });
    console.error('Create user failed:', err && err.message);
    res.status(500).json({ message: 'Could not create the account. Please try again.' });
  }
});

// POST /api/auth/login { identifier (email or username), password }
router.post('/login', loginLimiter, async (req, res) => {
  const identifier = normalizeEmail(req.body.identifier || req.body.email).replace(/^@/, '');
  const password = String(req.body.password || '');
  if (!identifier || !password) return res.status(400).json({ message: 'Enter your email (or username) and password' });

  const query = identifier.includes('@') ? { email: identifier } : { username: identifier };
  const user = await User.findOne(query).select('+passwordHash');
  const ok = Boolean(user && !user.isDeleted && user.passwordHash && (await verifyPassword(password, user.passwordHash)));
  if (!ok) return res.status(401).json({ message: 'Incorrect email/username or password' });

  res.json({ token: signToken(user._id), user: user.toSelf(), isNewUser: !user.name });
});

// POST /api/auth/forgot-password { email } -> always answers "pending" (does not reveal if the email exists)
router.post('/forgot-password', codeLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
  try {
    const user = await User.findOne({ email });
    if (user && !user.isDeleted) await issueCode({ email, purpose: 'reset', name: user.name });
  } catch (err) {
    console.error('Reset e-mail error:', err && err.message);
  }
  res.json({ email, status: 'pending' });
});

// POST /api/auth/reset-password { email, code, password } -> sets a new password and logs in
router.post('/reset-password', verifyLimiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.code || '').trim();
  const password = String(req.body.password || '');
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Invalid email or code' });
  const pProblem = passwordError(password);
  if (pProblem) return res.status(400).json({ message: pProblem });

  const rec = await checkCode({ email, purpose: 'reset', code });
  if (!rec) return res.status(400).json({ message: 'Incorrect or expired code' });

  const user = await User.findOne({ email });
  if (!user || user.isDeleted) return res.status(400).json({ message: 'Incorrect or expired code' });
  user.passwordHash = await hashPassword(password);
  user.emailVerified = true;
  await user.save();
  res.json({ token: signToken(user._id), user: user.toSelf(), isNewUser: !user.name });
});

module.exports = router;