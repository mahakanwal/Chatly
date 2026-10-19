const mongoose = require('mongoose');
const User = require('./models/User');
const Message = require('./models/Message');
const Conversation = require('./models/Conversation');
const { verifyToken } = require('./middleware/auth');
const { setIO, room, emitToUser, isOnline } = require('./realtime');
const { registerCallHandlers } = require('./socket-calls');
const { broadcastPresence } = require('./services/presence');

/** Group messages whose every member (except the sender) is in `field` get the new status. */
async function promoteGroupStatus(messageIds, field, status, at) {
  if (!messageIds.length) return;
  const msgs = await Message.find({ _id: { $in: messageIds } })
    .select('_id sender conversation status deliveredTo readBy')
    .populate('conversation', 'participants')
    .lean();
  const rank = { sent: 1, delivered: 2, seen: 3 };
  const byConvSender = {};
  for (const m of msgs) {
    if (!m.conversation) continue;
    const othersCount = m.conversation.participants.filter((p) => String(p) !== String(m.sender)).length;
    const count = field === 'readBy' ? (m.readBy || []).length : (m.deliveredTo || []).length;
    if (othersCount > 0 && count >= othersCount && (rank[m.status] || 0) < rank[status]) {
      const key = `${m.sender}|${m.conversation._id}`;
      (byConvSender[key] = byConvSender[key] || []).push(m._id);
    }
  }
  for (const [key, ids] of Object.entries(byConvSender)) {
    const [senderId, conversationId] = key.split('|');
    const set = status === 'seen' ? { status, seenAt: at } : { status, deliveredAt: at };
    await Message.updateMany({ _id: { $in: ids } }, { $set: set });
    emitToUser(senderId, 'message:status', { conversationId, ids: ids.map(String), status, at });
  }
}

/** Marks messages waiting for this user as delivered and tells the senders. */
async function deliverPending(userId) {
  const now = new Date();

  // One-to-one
  const pending = await Message.find({ recipient: userId, status: 'sent' }).select('_id sender conversation').lean();
  if (pending.length) {
    await Message.updateMany({ _id: { $in: pending.map((m) => m._id) } }, { $set: { status: 'delivered', deliveredAt: now } });
    const bySenderConv = {};
    pending.forEach((m) => {
      const key = `${m.sender}|${m.conversation}`;
      (bySenderConv[key] = bySenderConv[key] || []).push(String(m._id));
    });
    Object.entries(bySenderConv).forEach(([key, ids]) => {
      const [senderId, conversationId] = key.split('|');
      emitToUser(senderId, 'message:status', { conversationId, ids, status: 'delivered', at: now });
    });
  }

  // Groups
  const groups = await Conversation.find({ participants: userId, isGroup: true }).select('_id').lean();
  if (!groups.length) return;
  const groupPending = await Message.find({
    conversation: { $in: groups.map((g) => g._id) },
    sender: { $ne: userId },
    status: 'sent',
    deliveredTo: { $ne: userId },
  })
    .select('_id')
    .lean();
  if (!groupPending.length) return;
  const ids = groupPending.map((m) => m._id);
  await Message.updateMany({ _id: { $in: ids } }, { $addToSet: { deliveredTo: userId } });
  await promoteGroupStatus(ids, 'deliveredTo', 'delivered', now);
}

/** The user opened a chat: mark everything as read (respecting read-receipt privacy). */
async function markSeen(userId, conversationId) {
  const conv = await Conversation.findOne({ _id: conversationId, participants: userId }).select('_id isGroup participants clearedAt').lean();
  if (!conv) return;
  const now = new Date();

  if (conv.isGroup) {
    const filter = { conversation: conv._id, sender: { $ne: userId }, 'readBy.user': { $ne: userId } };
    // Skip messages from before this member joined / cleared the chat
    const cleared = conv.clearedAt && conv.clearedAt[String(userId)];
    if (cleared) filter.createdAt = { $gt: cleared };
    const unread = await Message.find(filter)
      .select('_id')
      .lean();
    if (unread.length) {
      const ids = unread.map((m) => m._id);
      await Message.updateMany({ _id: { $in: ids } }, { $push: { readBy: { user: userId, at: now } }, $addToSet: { deliveredTo: userId } });
      await promoteGroupStatus(ids, 'readBy', 'seen', now);
    }
    emitToUser(userId, 'conversation:read', { conversationId: String(conv._id) });
    return;
  }

  const unseen = await Message.find({ conversation: conv._id, recipient: userId, seenAt: null }).select('_id sender').lean();
  if (!unseen.length) return;

  // Blue ticks only when both people keep read receipts on (like WhatsApp)
  const senderIds = [...new Set(unseen.map((m) => String(m.sender)))];
  const people = await User.find({ _id: { $in: [userId, ...senderIds] } }).select('_id readReceipts').lean();
  const receiptsOn = (id) => {
    const u = people.find((p) => String(p._id) === String(id));
    return !u || u.readReceipts !== false;
  };
  const meOn = receiptsOn(userId);

  const bySender = {};
  unseen.forEach((m) => {
    (bySender[String(m.sender)] = bySender[String(m.sender)] || []).push(m._id);
  });

  for (const [senderId, ids] of Object.entries(bySender)) {
    if (meOn && receiptsOn(senderId)) {
      await Message.updateMany({ _id: { $in: ids } }, { $set: { status: 'seen', seenAt: now, deliveredAt: now } });
      emitToUser(senderId, 'message:status', { conversationId: String(conv._id), ids: ids.map(String), status: 'seen', at: now });
    } else {
      // Read (clears the unread badge) but the sender only sees "delivered"
      const changed = await Message.find({ _id: { $in: ids }, status: 'sent' }).select('_id').lean();
      await Message.updateMany({ _id: { $in: ids } }, { $set: { seenAt: now } });
      if (changed.length) {
        await Message.updateMany({ _id: { $in: changed.map((c) => c._id) } }, { $set: { status: 'delivered', deliveredAt: now } });
        emitToUser(senderId, 'message:status', { conversationId: String(conv._id), ids: changed.map((c) => String(c._id)), status: 'delivered', at: now });
      }
    }
  }
  // Sync unread badge on the user's other devices
  emitToUser(userId, 'conversation:read', { conversationId: String(conv._id) });
}

function initSocket(io) {
  setIO(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      const { id } = verifyToken(token);
      const user = await User.findById(id).select('_id name isBot isDeleted');
      if (!user || user.isBot || user.isDeleted) return next(new Error('unauthorized'));
      socket.data.userId = String(user._id);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId;
    const wasOnline = isOnline(userId);
    socket.join(room(userId));
    registerCallHandlers(socket);

    // { conversationId, isTyping } -> forwarded to the other member(s)
    socket.on('typing', async ({ conversationId, isTyping } = {}) => {
      if (!mongoose.isValidObjectId(conversationId)) return;
      const conv = await Conversation.findOne({ _id: conversationId, participants: userId }).select('participants').lean();
      if (!conv) return;
      conv.participants
        .filter((p) => String(p) !== userId)
        .forEach((p) => emitToUser(p, 'typing', { conversationId, userId, isTyping: Boolean(isTyping) }));
    });

    // { conversationId } -> user has the chat open, mark everything as seen
    socket.on('messages:seen', async ({ conversationId } = {}) => {
      if (!mongoose.isValidObjectId(conversationId)) return;
      try {
        await markSeen(userId, conversationId);
      } catch (e) {
        console.error('messages:seen', e.message);
      }
    });

    socket.on('disconnect', async () => {
      if (isOnline(userId)) return; // still connected on another device
      const lastSeen = new Date();
      await User.updateOne({ _id: userId }, { $set: { online: false, lastSeen } });
      broadcastPresence(userId, false, lastSeen).catch(() => {});
    });

    if (!wasOnline) {
      await User.updateOne({ _id: userId }, { $set: { online: true } });
      broadcastPresence(userId, true, null).catch(() => {});
    }
    deliverPending(userId).catch((e) => console.error('deliverPending', e.message));
  });
}

module.exports = { initSocket, markSeen };
