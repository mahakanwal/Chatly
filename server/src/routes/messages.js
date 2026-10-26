const router = require('express').Router();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { emitToUser } = require('../realtime');
const { destroy } = require('../services/storage');

const DELETE_FOR_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000;

// DELETE /api/messages/:id?scope=me|everyone
router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Message not found' });
  const msg = await Message.findById(req.params.id);
  const me = String(req.user._id);
  if (!msg) return res.status(404).json({ message: 'Message not found' });
  const conv = await Conversation.findById(msg.conversation).select('participants isGroup');
  const isMember = conv && conv.participants.some((p) => String(p) === me);
  if (!isMember || (!conv.isGroup && String(msg.sender) !== me && String(msg.recipient) !== me)) {
    return res.status(404).json({ message: 'Message not found' });
  }
  if (msg.type === 'system' && req.query.scope === 'everyone') {
    return res.status(400).json({ message: 'This message cannot be deleted for everyone' });
  }

  const scope = req.query.scope === 'everyone' ? 'everyone' : 'me';

  if (scope === 'me') {
    await Message.updateOne({ _id: msg._id }, { $addToSet: { deletedFor: req.user._id } });
    return res.json({ ok: true });
  }

  if (String(msg.sender) !== me) return res.status(403).json({ message: 'You can only delete your own messages for everyone' });
  if (Date.now() - msg.createdAt.getTime() > DELETE_FOR_EVERYONE_WINDOW_MS) {
    return res.status(400).json({ message: 'This message is too old to delete for everyone' });
  }

  if (msg.media && msg.media.publicId) destroy(msg.media.publicId, msg.media.resourceType);
  msg.deletedForEveryone = true;
  msg.text = '';
  msg.media = null;
  await msg.save();

  const payload = { conversationId: String(msg.conversation), messageId: String(msg._id) };
  conv.participants.forEach((p) => emitToUser(p, 'message:deleted', payload));

  // Keep conversation preview accurate
  await Conversation.updateOne({ _id: msg.conversation }, { $set: { updatedAt: new Date() } });
  res.json({ ok: true });
});

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🙏', '👍', '🔥', '😍'];
const serializeReactions = (list) => (list || []).map((r) => ({ user: String(r.user), emoji: r.emoji, at: r.at }));

// POST /api/messages/:id/react { emoji } -> toggle: same emoji removes, another replaces
router.post('/:id/react', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Message not found' });
  const emoji = String(req.body.emoji || '');
  if (!REACTION_EMOJIS.includes(emoji)) return res.status(400).json({ message: 'Choose a reaction' });
  const msg = await Message.findById(req.params.id);
  if (!msg || msg.deletedForEveryone || msg.type === 'system') return res.status(404).json({ message: 'Message not found' });
  const conv = await Conversation.findById(msg.conversation).select('participants');
  const me = String(req.user._id);
  if (!conv || !conv.participants.some((p) => String(p) === me)) return res.status(404).json({ message: 'Message not found' });
  if ((msg.deletedFor || []).some((id) => String(id) === me)) return res.status(404).json({ message: 'Message not found' });

  const reactions = msg.reactions || [];
  const mine = reactions.find((r) => String(r.user) === me);
  if (mine && mine.emoji === emoji) msg.reactions = reactions.filter((r) => String(r.user) !== me);
  else if (mine) mine.emoji = emoji, (mine.at = new Date());
  else msg.reactions = [...reactions, { user: req.user._id, emoji, at: new Date() }];
  await msg.save();

  const payload = { conversationId: String(msg.conversation), messageId: String(msg._id), reactions: serializeReactions(msg.reactions) };
  conv.participants.forEach((p) => emitToUser(p, 'message:reacted', payload));
  res.json({ reactions: payload.reactions });
});

// POST /api/messages/:id/view-once -> reveal a View Once message exactly once.
// The caller must be a conversation member, must not be the sender, and must
// not have viewed it before. On success the full content is returned AND the
// message is immediately hidden for this user (deletedFor), so it can never
// be fetched again — not by re-opening, not by reloading the chat, not by
// forwarding (the content is never in a list payload). The sender is told
// via socket 'message:viewed-once' so their bubble can flip to "Opened".
router.post('/:id/view-once', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Message not found' });
  const msg = await Message.findById(req.params.id);
  if (!msg || msg.deletedForEveryone || msg.type === 'system' || !msg.viewOnce) {
    return res.status(404).json({ message: 'Message not found' });
  }
  const me = String(req.user._id);
  const conv = await Conversation.findById(msg.conversation).select('participants isGroup');
  if (!conv || !conv.participants.some((id) => String(id) === me)) {
    return res.status(404).json({ message: 'Message not found' });
  }
  if (String(msg.sender) === me) {
    // Sender never sees the content, only whether anyone opened it.
    return res.json({ viewOnce: true, opened: (msg.viewedOnceBy || []).length > 0, viewedOnceBy: (msg.viewedOnceBy || []).map((v) => String(v.user || v)) });
  }
  if ((msg.viewedOnceBy || []).some((v) => String(v.user || v) === me)) {
    return res.status(410).json({ message: 'This message has already been viewed' });
  }
  if ((msg.deletedFor || []).some((id) => String(id) === me)) {
    return res.status(410).json({ message: 'This message has already been viewed' });
  }
  msg.viewedOnceBy = [...(msg.viewedOnceBy || []), { user: req.user._id, at: new Date() }];
  msg.deletedFor = [...(msg.deletedFor || []), req.user._id];
  // Mark as seen for this viewer (1:1 ticks / group read receipts).
  if (!conv.isGroup) msg.seenAt = msg.seenAt || new Date();
  else if (!(msg.readBy || []).some((r) => String(r.user) === me)) {
    msg.readBy = [...(msg.readBy || []), { user: req.user._id, at: new Date() }];
  }
  await msg.save();
  emitToUser(msg.sender, 'message:viewed-once', {
    conversationId: String(msg.conversation),
    messageId: String(msg._id),
    viewerId: me,
  });
  // Full content, returned only here — never in list/socket payloads.
  res.json({
    message: {
      _id: msg._id,
      conversation: msg.conversation,
      sender: msg.sender,
      type: msg.type,
      text: msg.text,
      media: msg.media,
      viewOnce: true,
      createdAt: msg.createdAt,
    },
  });
});

module.exports = router;
