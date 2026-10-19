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

module.exports = router;
