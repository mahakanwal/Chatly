const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { emitToUser } = require('../realtime');

/** Ids of everyone the user has a one-to-one chat with (they receive presence updates). */
async function contactIds(userId) {
  const convs = await Conversation.find({ participants: userId, isAI: false, isGroup: { $ne: true } })
    .select('participants')
    .lean();
  const ids = new Set();
  convs.forEach((c) =>
    c.participants.forEach((p) => {
      if (String(p) !== String(userId)) ids.add(String(p));
    })
  );
  return [...ids];
}

/**
 * Tells the user's contacts that they went online/offline.
 * When the user hides "last seen & online", contacts only get { hidden: true }.
 */
async function broadcastPresence(userId, online, lastSeen) {
  const [ids, user] = await Promise.all([contactIds(userId), User.findById(userId).select('hideLastSeen').lean()]);
  const hidden = Boolean(user && user.hideLastSeen);
  const payload = hidden ? { userId: String(userId), online: false, lastSeen: null, hidden: true } : { userId: String(userId), online, lastSeen, hidden: false };
  ids.forEach((id) => emitToUser(id, 'presence', payload));
}

module.exports = { contactIds, broadcastPresence };
