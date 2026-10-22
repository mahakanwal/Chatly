const router = require('express').Router();
const mongoose = require('mongoose');
const Moment = require('../models/Moment');
const User = require('../models/User');
const { audienceIds, serializeMoment, MOMENT_TTL_MS } = require('../services/moments');
const { destroy } = require('../services/storage');
const { emitToUser } = require('../realtime');
const { sendPush } = require('../services/push');

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const active = () => ({ expiresAt: { $gt: new Date() } });

// GET /api/moments -> { mine: [...], feed: [{ user, moments, latestAt, allSeen }] }
router.get('/', async (req, res) => {
  const me = req.user;
  const mine = await Moment.find({ user: me._id, ...active() }).sort({ createdAt: 1 }).lean();
  const ids = await audienceIds(me._id);

  const theirs = ids.length ? await Moment.find({ user: { $in: ids }, ...active() }).sort({ createdAt: 1 }).lean() : [];
  const byUser = {};
  theirs.forEach((m) => {
    (byUser[String(m.user)] = byUser[String(m.user)] || []).push(serializeMoment(m, me._id, false));
  });
  const users = await User.find({ _id: { $in: Object.keys(byUser) } });
  const feed = users
    .map((u) => {
      const moments = byUser[String(u._id)];
      return {
        user: u.toPublic(),
        moments,
        latestAt: moments[moments.length - 1].createdAt,
        allSeen: moments.every((m) => m.seen),
      };
    })
    .sort((a, b) => (a.allSeen !== b.allSeen ? (a.allSeen ? 1 : -1) : new Date(b.latestAt) - new Date(a.latestAt)));

  res.json({ mine: mine.map((m) => serializeMoment(m, me._id, true)), feed });
});

// POST /api/moments { type: text|image|video, text, bgColor, media }
router.post('/', async (req, res) => {
  const type = ['text', 'image', 'video'].includes(req.body.type) ? req.body.type : null;
  if (!type) return res.status(400).json({ message: 'Invalid moment type' });
  const text = String(req.body.text || '').trim().slice(0, 700);
  if (type === 'text' && !text) return res.status(400).json({ message: 'Write something first' });

  let media = null;
  if (type !== 'text') {
    const m = req.body.media;
    if (!m || typeof m.url !== 'string' || !m.url.startsWith('https://res.cloudinary.com/')) {
      return res.status(400).json({ message: 'Upload the photo or video first' });
    }
    media = {
      url: m.url,
      publicId: String(m.publicId || ''),
      resourceType: type === 'video' ? 'video' : 'image',
      duration: Number(m.duration) || undefined,
      width: Number(m.width) || undefined,
      height: Number(m.height) || undefined,
      thumbnail: typeof m.thumbnail === 'string' ? m.thumbnail : '',
    };
  }

  const moment = await Moment.create({
    user: req.user._id,
    type,
    text,
    bgColor: HEX_COLOR.test(req.body.bgColor) ? req.body.bgColor : '#E8473F',
    media,
    expiresAt: new Date(Date.now() + MOMENT_TTL_MS),
  });

  const ids = await audienceIds(req.user._id);
  ids.forEach((id) => emitToUser(id, 'moment:new', { userId: String(req.user._id) }));

  // Optional push for people who turned on Moment notifications
  if (ids.length) {
    const fans = await User.find({ _id: { $in: ids }, notifyMoments: true }).select('pushTokens');
    fans.forEach((u) =>
      sendPush(u, { title: req.user.name || 'New moment', body: 'Shared a new moment', data: { moment: true } })
    );
  }

  res.status(201).json({ moment: serializeMoment(moment, req.user._id, true) });
});

async function loadMoment(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: 'Moment not found' });
    return null;
  }
  const m = await Moment.findOne({ _id: req.params.id, ...active() });
  if (!m) {
    res.status(404).json({ message: 'This moment has expired' });
    return null;
  }
  return m;
}

// POST /api/moments/:id/view
router.post('/:id/view', async (req, res) => {
  const m = await loadMoment(req, res);
  if (!m) return;
  const me = String(req.user._id);
  if (String(m.user) === me) return res.json({ ok: true });
  const ids = await audienceIds(m.user);
  if (!ids.includes(me)) return res.status(403).json({ message: 'You cannot view this moment' });
  const updated = await Moment.findOneAndUpdate(
    { _id: m._id, 'viewers.user': { $ne: req.user._id } },
    { $push: { viewers: { user: req.user._id, at: new Date() } } },
    { new: true }
  );
  if (updated) emitToUser(m.user, 'moment:viewed', { momentId: String(m._id), viewCount: updated.viewers.length });
  res.json({ ok: true });
});

// GET /api/moments/:id/viewers (owner only)
router.get('/:id/viewers', async (req, res) => {
  const m = await loadMoment(req, res);
  if (!m) return;
  if (String(m.user) !== String(req.user._id)) return res.status(403).json({ message: 'Only you can see who viewed your moment' });
  await m.populate('viewers.user');
  const viewers = m.viewers
    .filter((v) => v.user)
    .sort((a, b) => b.at - a.at)
    .map((v) => ({ user: v.user.toPublic(), at: v.at }));
  res.json({ viewers });
});

// DELETE /api/moments/:id (owner only)
router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Moment not found' });
  const m = await Moment.findOne({ _id: req.params.id, user: req.user._id });
  if (!m) return res.status(404).json({ message: 'Moment not found' });
  if (m.media && m.media.publicId) destroy(m.media.publicId, m.media.resourceType || 'image');
  await m.deleteOne();
  const ids = await audienceIds(req.user._id);
  ids.forEach((id) => emitToUser(id, 'moment:deleted', { userId: String(req.user._id), momentId: String(m._id) }));
  res.json({ ok: true });
});

const MOMENT_REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🙏', '👍', '🔥', '😍'];
const serializeMomentReactions = (list) => (list || []).map((r) => ({ user: String(r.user), emoji: r.emoji, at: r.at }));

// POST /api/moments/:id/react { emoji } -> react to someone else's Moment (Status reaction)
router.post('/:id/react', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Moment not found' });
  const emoji = String(req.body.emoji || '');
  if (!MOMENT_REACTION_EMOJIS.includes(emoji)) return res.status(400).json({ message: 'Choose a reaction' });
  const m = await loadMoment(req, res);
  if (!m) return;
  const me = String(req.user._id);
  if (String(m.user) === me) return res.status(400).json({ message: 'You cannot react to your own moment' });
  const ids = await audienceIds(m.user);
  if (!ids.includes(me)) return res.status(403).json({ message: 'You cannot view this moment' });

  const reactions = m.reactions || [];
  const mine = reactions.find((r) => String(r.user) === me);
  if (mine && mine.emoji === emoji) m.reactions = reactions.filter((r) => String(r.user) !== me);
  else if (mine) mine.emoji = emoji, (mine.at = new Date());
  else reactions.push({ user: req.user._id, emoji, at: new Date() });
  await m.save();
  const out = serializeMomentReactions(m.reactions);
  emitToUser(m.user, 'moment:reacted', { momentId: String(m._id), reactions: out });
  res.json({ reactions: out });
});

module.exports = router;
