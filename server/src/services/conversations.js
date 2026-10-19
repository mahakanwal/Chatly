const { Types } = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { serialize } = require('./messages');

/** Messages of a conversation the user is allowed to see (respects "clear chat" and join date). */
function visibleFilter(conv, userId) {
  const filter = { conversation: conv._id, deletedFor: { $ne: userId } };
  const cleared = conv.clearedAt && conv.clearedAt.get && conv.clearedAt.get(String(userId));
  if (cleared) filter.createdAt = { $gt: cleared };
  return filter;
}

/** conversationId -> unread count for the user (one-to-one chats and groups). */
async function unreadCounts(userId) {
  const me = new Types.ObjectId(String(userId));
  const map = {};

  const rows = await Message.aggregate([
    { $match: { recipient: me, seenAt: null, deletedForEveryone: false } },
    { $group: { _id: '$conversation', count: { $sum: 1 } } },
  ]);
  rows.forEach((r) => {
    map[String(r._id)] = r.count;
  });

  const groups = await Conversation.find({ participants: me, isGroup: true }).select('_id clearedAt');
  await Promise.all(
    groups.map(async (g) => {
      const filter = {
        ...visibleFilter(g, me),
        sender: { $ne: me },
        'readBy.user': { $ne: me },
        type: { $ne: 'system' },
        deletedForEveryone: false,
      };
      const count = await Message.countDocuments(filter);
      if (count) map[String(g._id)] = count;
    })
  );
  return map;
}

function publicUser(u) {
  return u && u.toPublic ? u.toPublic() : u;
}

/** Shape sent to the app. Groups get a "peer" made from the group so list screens work unchanged. */
async function shapeConversation(conv, me, unreadMap) {
  let lastMessage = null;
  const cleared = conv.clearedAt && conv.clearedAt.get(String(me._id));
  const last = conv.lastMessage;
  if (
    last &&
    last._id &&
    !(last.deletedFor || []).some((id) => String(id) === String(me._id)) &&
    !(cleared && last.createdAt <= cleared)
  ) {
    lastMessage = serialize(last);
  }

  if (conv.isGroup) {
    const admins = (conv.admins || []).map(String);
    return {
      _id: conv._id,
      isAI: false,
      isGroup: true,
      peer: {
        _id: conv._id,
        name: conv.name,
        avatar: conv.avatar,
        about: conv.description,
        isGroup: true,
        isBot: false,
      },
      group: {
        name: conv.name,
        description: conv.description,
        avatar: conv.avatar,
        admins,
        createdBy: conv.createdBy ? String(conv.createdBy) : null,
        createdAt: conv.createdAt,
      },
      members: conv.participants.map(publicUser),
      isAdmin: admins.includes(String(me._id)),
      lastMessage,
      lastMessageAt: conv.lastMessageAt,
      unread: unreadMap[String(conv._id)] || 0,
      blockedByMe: false,
    };
  }

  const other = conv.participants.find((p) => String(p._id) !== String(me._id)) || conv.participants[0];
  return {
    _id: conv._id,
    isAI: conv.isAI,
    isGroup: false,
    peer: publicUser(other),
    lastMessage,
    lastMessageAt: conv.lastMessageAt,
    unread: unreadMap[String(conv._id)] || 0,
    blockedByMe: (me.blocked || []).some((id) => String(id) === String(other._id)),
  };
}

module.exports = { visibleFilter, unreadCounts, shapeConversation };
