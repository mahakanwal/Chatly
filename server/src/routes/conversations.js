const router = require('express').Router();
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { serialize, createAndDispatch, createGroupMessage, REPLY_FIELDS } = require('../services/messages');
const { getBotUser, replyToUser } = require('../services/ai');
const { shapeConversation, unreadCounts, visibleFilter } = require('../services/conversations');

/** Loads a conversation the current user belongs to, or sends 404. */
async function loadConversation(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: 'Chat not found' });
    return null;
  }
  const conv = await Conversation.findOne({ _id: req.params.id, participants: req.user._id });
  if (!conv) {
    res.status(404).json({ message: 'Chat not found' });
    return null;
  }
  return conv;
}

async function findOrCreatePair(me, other, isAI = false) {
  const pairKey = Conversation.pairKeyFor(me._id, other._id);
  let conv = await Conversation.findOne({ pairKey });
  if (!conv) {
    try {
      conv = await Conversation.create({ participants: [me._id, other._id], pairKey, isAI, lastMessageAt: isAI ? new Date() : new Date(0) });
    } catch (err) {
      if (err.code === 11000) conv = await Conversation.findOne({ pairKey });
      else throw err;
    }
  }
  return conv;
}

async function respondWith(conv, req, res) {
  await conv.populate('participants');
  await conv.populate('lastMessage');
  res.json({ conversation: await shapeConversation(conv, req.user, await unreadCounts(req.user._id)) });
}

// GET /api/conversations
router.get('/', async (req, res) => {
  const me = req.user;
  const bot = await getBotUser();
  await findOrCreatePair(me, bot, true); // AI chat always exists

  const convs = await Conversation.find({ participants: me._id }).sort({ lastMessageAt: -1 }).populate('participants').populate('lastMessage');
  const unreadMap = await unreadCounts(me._id);

  const list = [];
  for (const conv of convs) {
    // Hide empty person-to-person chats (opened but never messaged)
    if (!conv.isAI && !conv.isGroup && !conv.lastMessage) continue;
    list.push(await shapeConversation(conv, me, unreadMap));
  }
  // AI assistant pinned at top
  list.sort((a, b) => (b.isAI ? 1 : 0) - (a.isAI ? 1 : 0));
  res.json({ conversations: list });
});

// GET /api/conversations/ai
router.get('/ai', async (req, res) => {
  const bot = await getBotUser();
  const conv = await findOrCreatePair(req.user, bot, true);
  await respondWith(conv, req, res);
});

// POST /api/conversations { userId } -> open or create a chat with a user
router.post('/', async (req, res) => {
  const { userId } = req.body;
  if (!mongoose.isValidObjectId(userId) || String(userId) === String(req.user._id)) {
    return res.status(400).json({ message: 'Invalid user' });
  }
  const other = await User.findById(userId);
  if (!other) return res.status(404).json({ message: 'User not found' });
  const conv = await findOrCreatePair(req.user, other, other.isBot);
  await respondWith(conv, req, res);
});

// POST /api/conversations/:id/favourite -> star / unstar this chat (Favourites filter)
router.post('/:id/favourite', async (req, res) => {
  const conv = await loadConversation(req, res);
  if (!conv) return;
  const id = String(conv._id);
  const favs = req.user.favourites || [];
  const isFav = favs.some((f) => String(f) === id);
  if (isFav) req.user.favourites = favs.filter((f) => String(f) !== id);
  else req.user.favourites = [...favs, conv._id];
  await req.user.save();
  res.json({ ok: true, isFavourite: !isFav });
});

// GET /api/conversations/:id
router.get('/:id', async (req, res) => {
  const conv = await loadConversation(req, res);
  if (!conv) return;
  await respondWith(conv, req, res);
});

// GET /api/conversations/:id/messages?before=ISODate&limit=40
router.get('/:id/messages', async (req, res) => {
  const conv = await loadConversation(req, res);
  if (!conv) return;
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const filter = visibleFilter(conv, req.user._id);
  if (req.query.before) {
    const before = new Date(req.query.before);
    if (!Number.isNaN(before.getTime())) filter.createdAt = { ...(filter.createdAt || {}), $lt: before };
  }
  const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(limit).populate('replyTo', REPLY_FIELDS);
  res.json({ messages: messages.map(serialize), hasMore: messages.length === limit });
});

// GET /api/conversations/:id/media -> shared photos & videos
router.get('/:id/media', async (req, res) => {
  const conv = await loadConversation(req, res);
  if (!conv) return;
  const filter = { ...visibleFilter(conv, req.user._id), deletedForEveryone: false, type: { $in: ['image', 'video'] } };
  const messages = await Message.find(filter).sort({ createdAt: -1 }).limit(60);
  res.json({ messages: messages.map(serialize) });
});

// POST /api/conversations/:id/messages { type, text, media, replyTo, clientId, momentRef? }
router.post('/:id/messages', async (req, res) => {
  const conv = await loadConversation(req, res);
  if (!conv) return;

  const type = ['text', 'image', 'video', 'audio', 'document'].includes(req.body.type) ? req.body.type : 'text';
  const text = String(req.body.text || '').slice(0, 8000);
  const media = type === 'text' ? null : req.body.media;

  if (type === 'text' && !text.trim()) return res.status(400).json({ message: 'Message is empty' });
  if (type !== 'text' && (!media || typeof media.url !== 'string' || !media.url.startsWith('https://res.cloudinary.com/'))) {
    return res.status(400).json({ message: 'Upload the file first' });
  }

  let replyTo = null;
  if (req.body.replyTo && mongoose.isValidObjectId(req.body.replyTo)) {
    const exists = await Message.exists({ _id: req.body.replyTo, conversation: conv._id });
    if (exists) replyTo = req.body.replyTo;
  }
  const clientId = typeof req.body.clientId === 'string' ? req.body.clientId.slice(0, 64) : undefined;

  // ---------- Group ----------
  if (conv.isGroup) {
    if (conv.onlyAdminsCanSend && !(conv.admins || []).some((a) => String(a) === String(req.user._id))) {
      return res.status(403).json({ message: 'Only admins can send messages in this group' });
    }
    const message = await createGroupMessage({ conversation: conv, sender: req.user, type, text: text.trim(), media, replyTo, clientId });
    return res.status(201).json({ message });
  }

  // ---------- One-to-one ----------
  const recipientId = conv.participants.find((p) => String(p) !== String(req.user._id));
  const recipient = await User.findById(recipientId);
  if (!recipient || recipient.isDeleted) return res.status(410).json({ message: 'This account has been deleted' });
  if ((req.user.blocked || []).some((id) => String(id) === String(recipient._id))) {
    return res.status(403).json({ message: 'Unblock this contact to send a message' });
  }
  if ((recipient.blocked || []).some((id) => String(id) === String(req.user._id))) {
    return res.status(403).json({ message: 'You cannot message this contact' });
  }

  let momentRef = null;
  const ref = req.body.momentRef;
  if (ref && typeof ref === 'object' && mongoose.isValidObjectId(ref.momentId)) {
    momentRef = {
      momentId: ref.momentId,
      type: ['text', 'image', 'video'].includes(ref.type) ? ref.type : 'text',
      text: String(ref.text || '').slice(0, 200),
      thumb: typeof ref.thumb === 'string' && ref.thumb.startsWith('https://') ? ref.thumb : '',
    };
  }

  const message = await createAndDispatch({
    conversation: conv,
    sender: req.user,
    recipient,
    type,
    text: text.trim(),
    media,
    replyTo,
    momentRef,
    clientId,
  });

  res.status(201).json({ message });

  if (recipient.isBot) replyToUser(conv, req.user).catch((e) => console.error(e));
});

// DELETE /api/conversations/:id/messages -> clear chat for me
router.delete('/:id/messages', async (req, res) => {
  const conv = await loadConversation(req, res);
  if (!conv) return;
  const now = new Date();
  conv.clearedAt.set(String(req.user._id), now);
  await conv.save();
  // Clearing also marks everything as read for me
  if (conv.isGroup) {
    await Message.updateMany(
      { conversation: conv._id, sender: { $ne: req.user._id }, 'readBy.user': { $ne: req.user._id } },
      { $push: { readBy: { user: req.user._id, at: now } } }
    );
  } else {
    await Message.updateMany({ conversation: conv._id, recipient: req.user._id, seenAt: null }, { $set: { seenAt: now } });
  }
  res.json({ ok: true });
});

module.exports = router;
