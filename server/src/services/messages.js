const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { emitToUser, isOnline } = require('../realtime');
const { sendPush } = require('./push');

const REPLY_FIELDS = 'type text sender media deletedForEveryone';

function previewText(msg) {
  if (!msg) return '';
  if (msg.deletedForEveryone) return 'This message was deleted';
  switch (msg.type) {
    case 'image':
      return msg.text ? `Photo: ${msg.text}` : 'Photo';
    case 'video':
      return msg.text ? `Video: ${msg.text}` : 'Video';
    case 'audio':
      return 'Voice message';
    case 'document':
      return msg.media && msg.media.name ? msg.media.name : 'Document';
    default:
      return msg.text;
  }
}

function serializeReply(reply) {
  // Not populated (plain ObjectId) or missing
  if (!reply || typeof reply !== 'object' || !reply._id || reply.type === undefined) return null;
  return {
    _id: reply._id,
    sender: reply.sender,
    type: reply.deletedForEveryone ? 'text' : reply.type,
    text: reply.deletedForEveryone ? 'This message was deleted' : reply.text,
    mediaThumb: reply.deletedForEveryone || !reply.media ? '' : reply.media.thumbnail || (reply.type === 'image' ? reply.media.url : ''),
  };
}

function serialize(msg) {
  const m = msg.toObject ? msg.toObject() : msg;
  const deleted = Boolean(m.deletedForEveryone);
  return {
    _id: m._id,
    conversation: m.conversation,
    sender: m.sender,
    recipient: m.recipient,
    type: deleted ? 'text' : m.type,
    text: deleted ? '' : m.text,
    media: deleted ? null : m.media,
    replyTo: deleted ? null : serializeReply(m.replyTo),
    momentRef: deleted ? null : m.momentRef || null,
    status: m.status,
    deleted,
    clientId: m.clientId,
    createdAt: m.createdAt,
    deliveredAt: m.deliveredAt,
    seenAt: m.seenAt,
    readCount: Array.isArray(m.readBy) ? m.readBy.length : 0,
  };
}

/**
 * One-to-one chat: saves a message, updates the conversation, delivers it in
 * real time and sends a push notification when the recipient is offline.
 */
async function createAndDispatch({ conversation, sender, recipient, type = 'text', text = '', media = null, replyTo = null, momentRef = null, clientId }) {
  const recipientOnline = recipient.isBot || isOnline(recipient._id);
  const now = new Date();

  let status = 'sent';
  if (recipient.isBot) status = 'seen';
  else if (recipientOnline) status = 'delivered';

  const doc = await Message.create({
    conversation: conversation._id,
    sender: sender._id,
    recipient: recipient._id,
    type,
    text,
    media,
    replyTo,
    momentRef,
    clientId,
    status,
    deliveredAt: status !== 'sent' ? now : undefined,
    seenAt: status === 'seen' ? now : undefined,
  });

  await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessage: doc._id, lastMessageAt: doc.createdAt } });

  await doc.populate('replyTo', REPLY_FIELDS);
  const payload = serialize(doc);

  if (!sender.isBot) emitToUser(sender._id, 'message:new', payload);
  if (!recipient.isBot) emitToUser(recipient._id, 'message:new', payload);

  if (!recipient.isBot && !recipientOnline) {
    const fresh = await User.findById(recipient._id).select('pushTokens notifyMessages');
    if (fresh && fresh.notifyMessages !== false) {
      sendPush(fresh, {
        title: sender.name || sender.phone,
        body: momentRef ? `Replied to your moment: ${text}` : previewText(doc),
        data: { conversationId: String(conversation._id), senderId: String(sender._id) },
      });
    }
  }

  return payload;
}

/**
 * Group chat: saves the message, delivers it to every member and pushes to
 * offline members. Status: sent -> delivered (all members got it) -> seen (all read it).
 * system = true for events like "Ali added Sara" (no push, no ticks).
 */
async function createGroupMessage({ conversation, sender, type = 'text', text = '', media = null, replyTo = null, clientId, system = false }) {
  const members = conversation.participants.map((p) => String(p._id || p));
  const others = members.filter((id) => id !== String(sender._id));
  const onlineOthers = others.filter((id) => isOnline(id));
  const now = new Date();

  let status = 'sent';
  if (system || (others.length && onlineOthers.length === others.length)) status = 'delivered';

  const doc = await Message.create({
    conversation: conversation._id,
    sender: sender._id,
    recipient: null,
    type: system ? 'system' : type,
    text,
    media: system ? null : media,
    replyTo: system ? null : replyTo,
    clientId,
    status,
    deliveredTo: onlineOthers,
    deliveredAt: status !== 'sent' ? now : undefined,
    readBy: system ? members.map((id) => ({ user: id, at: now })) : [],
  });

  await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessage: doc._id, lastMessageAt: doc.createdAt } });

  await doc.populate('replyTo', REPLY_FIELDS);
  const payload = serialize(doc);
  members.forEach((id) => emitToUser(id, 'message:new', payload));

  if (!system) {
    const offline = others.filter((id) => !onlineOthers.includes(id));
    if (offline.length) {
      const users = await User.find({ _id: { $in: offline } }).select('pushTokens notifyGroups');
      users.forEach((u) => {
        if (u.notifyGroups === false) return;
        sendPush(u, {
          title: conversation.name || 'Group',
          body: `${sender.name || sender.phone}: ${previewText(doc)}`,
          data: { conversationId: String(conversation._id), senderId: String(sender._id) },
        });
      });
    }
  }

  return payload;
}

module.exports = { serialize, createAndDispatch, createGroupMessage, previewText, REPLY_FIELDS };
