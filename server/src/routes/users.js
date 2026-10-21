const router = require('express').Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Report = require('../models/Report');
const { disconnectUser } = require('../realtime');
const { toE164, countryOf } = require('../utils/phone');
const { normalizeUsername, usernameError } = require('../utils/accounts');
const { singleFile } = require('../middleware/upload');
const { uploadBuffer, destroy } = require('../services/storage');
const { broadcastPresence } = require('../services/presence');
const { isOnline } = require('../realtime');

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const BOOL_SETTINGS = ['hideLastSeen', 'readReceipts', 'notifyMessages', 'notifyGroups', 'notifyMoments'];

// GET /api/users/me
router.get('/me', (req, res) => res.json({ user: req.user.toSelf() }));

// PATCH /api/users/me { name?, about?, username?, phone? (optional, NOT verified), hideLastSeen?, readReceipts?, notifyMessages?, notifyGroups?, notifyMoments? }
router.patch('/me', async (req, res) => {
  const { name, about, username, phone } = req.body;
  if (username !== undefined) {
    const next = normalizeUsername(username);
    if (next !== req.user.username) {
      const problem = usernameError(next);
      if (problem) return res.status(400).json({ message: problem });
      if (await User.exists({ username: next, _id: { $ne: req.user._id } })) {
        return res.status(409).json({ message: 'This username is taken' });
      }
      req.user.username = next;
    }
  }
  if (phone !== undefined) {
    const raw = String(phone).trim();
    if (!raw) {
      req.user.phone = undefined; // remove my number
    } else {
      const e164 = toE164(raw, countryOf(req.user.phone) || 'PK');
      if (!e164) return res.status(400).json({ message: 'Enter a valid phone number' });
      if (await User.exists({ phone: e164, _id: { $ne: req.user._id } })) {
        return res.status(409).json({ message: 'This number is already used by another account' });
      }
      req.user.phone = e164;
    }
  }
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ message: 'Name cannot be empty' });
    req.user.name = trimmed.slice(0, 50);
  }
  if (about !== undefined) req.user.about = String(about).trim().slice(0, 140);

  const privacyBefore = Boolean(req.user.hideLastSeen);
  BOOL_SETTINGS.forEach((key) => {
    if (req.body[key] !== undefined) req.user[key] = Boolean(req.body[key]);
  });
  await req.user.save();

  // Contacts see the privacy change right away
  if (privacyBefore !== Boolean(req.user.hideLastSeen)) {
    broadcastPresence(req.user._id, isOnline(req.user._id), req.user.online ? null : req.user.lastSeen).catch(() => {});
  }
  res.json({ user: req.user.toSelf() });
});

// PUT /api/users/me/wallpaper { color: '#RRGGBB' } -> solid colour wallpaper
router.put('/me/wallpaper', async (req, res) => {
  const color = String(req.body.color || '');
  if (!HEX_COLOR.test(color)) return res.status(400).json({ message: 'Choose a valid colour' });
  if (req.user.wallpaperPublicId) destroy(req.user.wallpaperPublicId, 'image');
  req.user.wallpaper = `color:${color.toUpperCase()}`;
  req.user.wallpaperPublicId = '';
  await req.user.save();
  res.json({ user: req.user.toSelf() });
});

// POST /api/users/me/wallpaper (multipart "file") -> photo wallpaper
router.post('/me/wallpaper', singleFile('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image uploaded' });
  if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ message: 'Wallpaper must be an image' });
  let media;
  try {
    media = await uploadBuffer(req.file.buffer, {
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      folder: 'chatly/wallpapers',
    });
  } catch (err) {
    console.error('Wallpaper upload failed:', err.message);
    return res.status(502).json({ message: `Upload failed: ${err.message || 'storage error'}` });
  }
  const oldId = req.user.wallpaperPublicId;
  req.user.wallpaper = media.url;
  req.user.wallpaperPublicId = media.publicId;
  await req.user.save();
  if (oldId) destroy(oldId, 'image');
  res.json({ user: req.user.toSelf() });
});

// DELETE /api/users/me/wallpaper -> back to the default background
router.delete('/me/wallpaper', async (req, res) => {
  if (req.user.wallpaperPublicId) destroy(req.user.wallpaperPublicId, 'image');
  req.user.wallpaper = '';
  req.user.wallpaperPublicId = '';
  await req.user.save();
  res.json({ user: req.user.toSelf() });
});

// GET /api/users/blocked -> people I blocked
router.get('/blocked', async (req, res) => {
  const users = await User.find({ _id: { $in: req.user.blocked || [] } }).sort({ name: 1 });
  res.json({ users: users.map((u) => u.toPublic()) });
});

// POST /api/users/me/avatar (multipart "file")
router.post('/me/avatar', singleFile('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image uploaded' });
  if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ message: 'Avatar must be an image' });

  let media;
  try {
    media = await uploadBuffer(req.file.buffer, {
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      folder: 'chatly/avatars',
    });
  } catch (err) {
    console.error('Avatar upload failed:', err.message);
    return res.status(502).json({ message: `Upload failed: ${err.message || 'storage error'}` });
  }
  const oldId = req.user.avatarPublicId;
  req.user.avatar = media.url;
  req.user.avatarPublicId = media.publicId;
  await req.user.save();
  if (oldId) destroy(oldId, 'image');
  res.json({ user: req.user.toSelf() });
});

// DELETE /api/users/me/avatar
router.delete('/me/avatar', async (req, res) => {
  if (req.user.avatarPublicId) destroy(req.user.avatarPublicId, 'image');
  req.user.avatar = '';
  req.user.avatarPublicId = '';
  await req.user.save();
  res.json({ user: req.user.toSelf() });
});

// POST /api/users/me/push-token { token }
router.post('/me/push-token', async (req, res) => {
  const token = String(req.body.token || '');
  if (!token) return res.status(400).json({ message: 'Token required' });
  await User.updateOne({ _id: req.user._id }, { $addToSet: { pushTokens: token } });
  // A device belongs to one account at a time
  await User.updateMany({ _id: { $ne: req.user._id } }, { $pull: { pushTokens: token } });
  res.json({ ok: true });
});

// DELETE /api/users/me/push-token { token } (on logout)
router.delete('/me/push-token', async (req, res) => {
  const token = String(req.body.token || '');
  if (token) await User.updateOne({ _id: req.user._id }, { $pull: { pushTokens: token } });
  res.json({ ok: true });
});

// POST /api/users/sync { phones: string[] } -> registered users among phone contacts
router.post('/sync', async (req, res) => {
  const phones = Array.isArray(req.body.phones) ? req.body.phones.slice(0, 5000) : [];
  const country = countryOf(req.user.phone);
  const map = {}; // e164 -> first raw number seen
  phones.forEach((raw) => {
    const e164 = toE164(String(raw), country);
    if (e164 && e164 !== req.user.phone && !map[e164]) map[e164] = raw;
  });
  const users = await User.find({ phone: { $in: Object.keys(map) }, isBot: false, name: { $ne: '' } }).sort({ name: 1 });
  res.json({ users: users.map((u) => u.toPublic()) });
});

// GET /api/users/search?q=... -> find people by username (starts with) or by a full phone number
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().replace(/^@/, '').slice(0, 30);
  if (q.length < 2) return res.json({ users: [] });
  const base = { isBot: false, isDeleted: { $ne: true }, _id: { $ne: req.user._id } };

  let users = [];
  if (/^[+\d][\d\s\-()]{6,}$/.test(q)) {
    const phone = toE164(q, countryOf(req.user.phone) || 'PK');
    if (phone) users = await User.find({ ...base, phone }).limit(5);
  } else {
    const safe = q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    users = await User.find({ ...base, username: new RegExp(`^${safe}`) }).sort({ username: 1 }).limit(20);
  }
  res.json({ users: users.map((u) => u.toPublic()) });
});

// GET /api/users/lookup?phone=...
router.get('/lookup', async (req, res) => {
  const phone = toE164(String(req.query.phone || ''), countryOf(req.user.phone));
  if (!phone) return res.status(400).json({ message: 'Enter a valid phone number' });
  if (phone === req.user.phone) return res.status(400).json({ message: 'This is your own number' });
  const user = await User.findOne({ phone, isBot: false });
  if (!user || !user.name) return res.status(404).json({ message: 'This number is not registered on the app yet' });
  res.json({ user: user.toPublic() });
});

// DELETE /api/users/me -> permanently delete my account (required by App Store / Play Store)
router.delete('/me', async (req, res) => {
  const me = req.user;
  if (me.avatarPublicId) destroy(me.avatarPublicId, 'image');
  if (me.wallpaperPublicId) destroy(me.wallpaperPublicId, 'image');

  // Remove my private AI chat entirely
  const bot = await User.findOne({ isBot: true }).select('_id');
  if (bot) {
    const aiConv = await Conversation.findOne({ pairKey: Conversation.pairKeyFor(me._id, bot._id) });
    if (aiConv) {
      await Message.deleteMany({ conversation: aiConv._id });
      await aiConv.deleteOne();
    }
  }

  // Remove my Moments
  const Moment = require('../models/Moment');
  const myMoments = await Moment.find({ user: me._id }).select('media').lean();
  myMoments.forEach((m) => m.media && m.media.publicId && destroy(m.media.publicId, m.media.resourceType || 'image'));
  await Moment.deleteMany({ user: me._id });

  // Leave every group (other members keep the history)
  const { removeMember } = require('./groups');
  const { createGroupMessage } = require('../services/messages');
  const { emitToUser } = require('../realtime');
  const groups = await Conversation.find({ isGroup: true, participants: me._id });
  for (const g of groups) {
    await removeMember(g, me._id);
    if (g.participants.length) {
      await createGroupMessage({ conversation: g, sender: me, system: true, text: `${me.name || 'A member'} left` });
      g.participants.forEach((p) => emitToUser(p, 'group:updated', { conversationId: String(g._id) }));
    }
  }

  // Free the phone number and remove personal data; other people keep their chat history
  me.phone = undefined;
  me.email = undefined;
  me.username = undefined;
  me.passwordHash = undefined;
  me.name = 'Deleted account';
  me.about = '';
  me.avatar = '';
  me.avatarPublicId = '';
  me.wallpaper = '';
  me.wallpaperPublicId = '';
  me.pushTokens = [];
  me.blocked = [];
  me.online = false;
  me.isDeleted = true;
  await me.save();

  disconnectUser(me._id);
  res.json({ ok: true });
});

// POST /api/users/:id/block
router.post('/:id/block', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || req.params.id === String(req.user._id)) {
    return res.status(400).json({ message: 'Invalid user' });
  }
  await User.updateOne({ _id: req.user._id }, { $addToSet: { blocked: req.params.id } });
  res.json({ ok: true, blocked: true });
});

// DELETE /api/users/:id/block
router.delete('/:id/block', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid user' });
  await User.updateOne({ _id: req.user._id }, { $pull: { blocked: req.params.id } });
  res.json({ ok: true, blocked: false });
});

// POST /api/users/:id/report { reason, conversationId } -> also blocks the user
router.post('/:id/report', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || req.params.id === String(req.user._id)) {
    return res.status(400).json({ message: 'Invalid user' });
  }
  const reported = await User.findById(req.params.id).select('_id isBot');
  if (!reported || reported.isBot) return res.status(404).json({ message: 'User not found' });
  await Report.create({
    reporter: req.user._id,
    reported: reported._id,
    conversation: mongoose.isValidObjectId(req.body.conversationId) ? req.body.conversationId : undefined,
    reason: String(req.body.reason || '').slice(0, 500),
  });
  await User.updateOne({ _id: req.user._id }, { $addToSet: { blocked: reported._id } });
  res.json({ ok: true, blocked: true });
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'User not found' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const blockedByMe = req.user.blocked.some((id) => String(id) === String(user._id));
  res.json({ user: user.toPublic(), blockedByMe });
});

module.exports = router;