const router = require('express').Router();
const mongoose = require('mongoose');
const Channel = require('../models/Channel');
const ChannelPost = require('../models/ChannelPost');
const User = require('../models/User');
const { singleFile } = require('../middleware/upload');
const { uploadBuffer, destroy } = require('../services/storage');

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🙏', '👍', '🔥', '😍'];
const serializeReactions = (list) => (list || []).map((r) => ({ user: String(r.user), emoji: r.emoji, at: r.at }));

function shapeChannel(ch, me) {
  const meId = String(me._id);
  return {
    _id: ch._id,
    name: ch.name,
    description: ch.description,
    avatar: ch.avatar,
    owner: ch.owner && ch.owner.toPublic ? ch.owner.toPublic() : ch.owner,
    admins: (ch.admins || []).map(String),
    followerCount: (ch.followers || []).length,
    isFollowing: (ch.followers || []).some((f) => String(f._id || f) === meId),
    isAdmin: (ch.admins || []).some((a) => String(a._id || a) === meId),
    isOwner: String(ch.owner && (ch.owner._id || ch.owner)) === meId,
    createdAt: ch.createdAt,
  };
}

function shapePost(post, me) {
  return {
    _id: post._id,
    channel: String(post.channel),
    author: post.author && post.author.toPublic ? post.author.toPublic() : post.author,
    type: post.type,
    text: post.text,
    media: post.media || null,
    reactions: serializeReactions(post.reactions),
    myReaction: (post.reactions || []).find((r) => String(r.user) === String(me._id))?.emoji || null,
    createdAt: post.createdAt,
  };
}

async function loadChannel(req, res, { adminOnly = false } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: 'Channel not found' });
    return null;
  }
  const ch = await Channel.findById(req.params.id).populate('owner');
  if (!ch) {
    res.status(404).json({ message: 'Channel not found' });
    return null;
  }
  if (adminOnly && !(ch.admins || []).some((a) => String(a) === String(req.user._id))) {
    res.status(403).json({ message: 'Only channel admins can do this' });
    return null;
  }
  return ch;
}

// GET /api/channels -> all channels (discoverable), followed first
router.get('/', async (req, res) => {
  const list = await Channel.find({}).populate('owner').sort({ createdAt: -1 });
  const shaped = list.map((c) => shapeChannel(c, req.user));
  shaped.sort((a, b) => (b.isFollowing ? 1 : 0) - (a.isFollowing ? 1 : 0));
  res.json({ channels: shaped });
});

// POST /api/channels { name, description? }
router.post('/', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ message: 'Enter a channel name' });
  const ch = await Channel.create({
    name,
    description: String(req.body.description || '').trim().slice(0, 500),
    owner: req.user._id,
    admins: [req.user._id],
    followers: [req.user._id],
  });
  await ch.populate('owner');
  res.status(201).json({ channel: shapeChannel(ch, req.user) });
});

// GET /api/channels/:id
router.get('/:id', async (req, res) => {
  const ch = await loadChannel(req, res);
  if (!ch) return;
  res.json({ channel: shapeChannel(ch, req.user) });
});

// POST /api/channels/:id/follow -> toggle follow (owner cannot unfollow their own channel)
router.post('/:id/follow', async (req, res) => {
  const ch = await loadChannel(req, res);
  if (!ch) return;
  const me = String(req.user._id);
  const following = (ch.followers || []).some((f) => String(f) === me);
  if (following && String(ch.owner._id || ch.owner) === me) {
    return res.status(400).json({ message: 'You cannot unfollow your own channel' });
  }
  ch.followers = following ? ch.followers.filter((f) => String(f) !== me) : [...(ch.followers || []), req.user._id];
  await ch.save();
  await ch.populate('owner');
  res.json({ channel: shapeChannel(ch, req.user) });
});

// POST /api/channels/:id/avatar (multipart "file", admins)
router.post('/:id/avatar', singleFile('file'), async (req, res) => {
  const ch = await loadChannel(req, res, { adminOnly: true });
  if (!ch) return;
  if (!req.file || !req.file.mimetype.startsWith('image/')) return res.status(400).json({ message: 'Choose an image' });
  let media;
  try {
    media = await uploadBuffer(req.file.buffer, { mimeType: req.file.mimetype, originalName: req.file.originalname, folder: 'chatly/channels' });
  } catch (err) {
    return res.status(502).json({ message: `Upload failed: ${err.message || 'storage error'}` });
  }
  const oldId = ch.avatarPublicId;
  ch.avatar = media.url;
  ch.avatarPublicId = media.publicId;
  await ch.save();
  if (oldId) destroy(oldId, 'image');
  await ch.populate('owner');
  res.json({ channel: shapeChannel(ch, req.user) });
});

// GET /api/channels/:id/posts
router.get('/:id/posts', async (req, res) => {
  const ch = await loadChannel(req, res);
  if (!ch) return;
  const posts = await ChannelPost.find({ channel: ch._id }).sort({ createdAt: -1 }).limit(100).populate('author');
  res.json({ posts: posts.map((p) => shapePost(p, req.user)) });
});

// POST /api/channels/:id/posts { type, text, media } (admins only — broadcast)
router.post('/:id/posts', async (req, res) => {
  const ch = await loadChannel(req, res, { adminOnly: true });
  if (!ch) return;
  const type = ['text', 'image', 'video'].includes(req.body.type) ? req.body.type : 'text';
  const text = String(req.body.text || '').trim().slice(0, 4000);
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
  const post = await ChannelPost.create({ channel: ch._id, author: req.user._id, type, text, media });
  await post.populate('author');
  res.status(201).json({ post: shapePost(post, req.user) });
});

// POST /api/channels/posts/:postId/react { emoji } -> toggle
router.post('/posts/:postId/react', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.postId)) return res.status(404).json({ message: 'Post not found' });
  const emoji = String(req.body.emoji || '');
  if (!REACTION_EMOJIS.includes(emoji)) return res.status(400).json({ message: 'Choose a reaction' });
  const post = await ChannelPost.findById(req.params.postId);
  if (!post) return res.status(404).json({ message: 'Post not found' });
  const me = String(req.user._id);
  const reactions = post.reactions || [];
  const mine = reactions.find((r) => String(r.user) === me);
  if (mine && mine.emoji === emoji) post.reactions = reactions.filter((r) => String(r.user) !== me);
  else if (mine) mine.emoji = emoji, (mine.at = new Date());
  else post.reactions = [...reactions, { user: req.user._id, emoji, at: new Date() }];
  await post.save();
  res.json({ reactions: serializeReactions(post.reactions) });
});

// DELETE /api/channels/posts/:postId (channel admin or author)
router.delete('/posts/:postId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.postId)) return res.status(404).json({ message: 'Post not found' });
  const post = await ChannelPost.findById(req.params.postId);
  if (!post) return res.status(404).json({ message: 'Post not found' });
  const ch = await Channel.findById(post.channel);
  const me = String(req.user._id);
  const isAdmin = ch && (ch.admins || []).some((a) => String(a) === me);
  if (!isAdmin && String(post.author) !== me) return res.status(403).json({ message: 'Only channel admins can delete this post' });
  if (post.media && post.media.publicId) destroy(post.media.publicId, post.media.resourceType || 'image');
  await post.deleteOne();
  res.json({ ok: true });
});

// POST /api/channels/:id/admins/:userId -> make admin (admins)
router.post('/:id/admins/:userId', async (req, res) => {
  const ch = await loadChannel(req, res, { adminOnly: true });
  if (!ch) return;
  if (!(ch.followers || []).some((f) => String(f) === String(req.params.userId))) {
    return res.status(400).json({ message: 'Only a follower can become an admin' });
  }
  if (!(ch.admins || []).some((a) => String(a) === String(req.params.userId))) {
    ch.admins.push(req.params.userId);
    await ch.save();
  }
  await ch.populate('owner');
  res.json({ channel: shapeChannel(ch, req.user) });
});

// DELETE /api/channels/:id/admins/:userId -> dismiss as admin (admins, at least one stays)
router.delete('/:id/admins/:userId', async (req, res) => {
  const ch = await loadChannel(req, res, { adminOnly: true });
  if (!ch) return;
  const remaining = (ch.admins || []).filter((a) => String(a) !== String(req.params.userId));
  if (!remaining.length) return res.status(400).json({ message: 'A channel needs at least one admin' });
  ch.admins = remaining;
  await ch.save();
  await ch.populate('owner');
  res.json({ channel: shapeChannel(ch, req.user) });
});

// DELETE /api/channels/:id (owner only)
router.delete('/:id', async (req, res) => {
  const ch = await loadChannel(req, res);
  if (!ch) return;
  if (String(ch.owner._id || ch.owner) !== String(req.user._id)) return res.status(403).json({ message: 'Only the channel owner can delete it' });
  const posts = await ChannelPost.find({ channel: ch._id }).select('media').lean();
  posts.forEach((p) => p.media && p.media.publicId && destroy(p.media.publicId, p.media.resourceType || 'image'));
  await ChannelPost.deleteMany({ channel: ch._id });
  if (ch.avatarPublicId) destroy(ch.avatarPublicId, 'image');
  await ch.deleteOne();
  res.json({ ok: true });
});

module.exports = router;
