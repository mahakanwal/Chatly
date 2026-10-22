const Conversation = require('../models/Conversation');
const Moment = require('../models/Moment');
const User = require('../models/User');
const { destroy } = require('./storage');

const MOMENT_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_EVERY_MS = 10 * 60 * 1000;

/**
 * People who can see the user's Moments (and whose Moments the user sees):
 * everyone they have a real one-to-one chat with, minus blocks in either direction.
 */
async function audienceIds(userId) {
  const me = await User.findById(userId).select('blocked').lean();
  const convs = await Conversation.find({
    participants: userId,
    isAI: false,
    isGroup: { $ne: true },
    lastMessage: { $ne: null },
  })
    .select('participants')
    .lean();
  const ids = new Set();
  convs.forEach((c) =>
    c.participants.forEach((p) => {
      if (String(p) !== String(userId)) ids.add(String(p));
    })
  );
  const myBlocked = new Set(((me && me.blocked) || []).map(String));
  const others = await User.find({ _id: { $in: [...ids] }, isDeleted: { $ne: true }, isBot: false }).select('_id blocked').lean();
  return others
    .filter((u) => !myBlocked.has(String(u._id)) && !(u.blocked || []).some((b) => String(b) === String(userId)))
    .map((u) => String(u._id));
}

function serializeMoment(m, viewerId, isOwner) {
  const viewers = m.viewers || [];
  return {
    _id: m._id,
    user: String(m.user._id || m.user),
    type: m.type,
    text: m.text,
    bgColor: m.bgColor,
    media: m.media
      ? {
          url: m.media.url,
          thumbnail: m.media.thumbnail || '',
          duration: m.media.duration,
          width: m.media.width,
          height: m.media.height,
        }
      : null,
    createdAt: m.createdAt,
    reactions: (m.reactions || []).map((r) => ({ user: String(r.user), emoji: r.emoji, at: r.at })),
    myReaction: (m.reactions || []).find((r) => String(r.user) === String(viewerId))?.emoji || null,
    likes: (m.likes || []).map(String),
    likeCount: (m.likes || []).length,
    liked: (m.likes || []).some((id) => String(id) === String(viewerId)),
    expiresAt: m.expiresAt,
    seen: isOwner ? true : viewers.some((v) => String(v.user) === String(viewerId)),
    viewCount: isOwner ? viewers.length : undefined,
  };
}

/** Deletes expired Moments and their files. */
async function cleanupExpired() {
  const expired = await Moment.find({ expiresAt: { $lte: new Date() } }).select('_id media').lean();
  if (!expired.length) return;
  expired.forEach((m) => {
    if (m.media && m.media.publicId) destroy(m.media.publicId, m.media.resourceType || 'image');
  });
  await Moment.deleteMany({ _id: { $in: expired.map((m) => m._id) } });
}

function startMomentCleanup() {
  cleanupExpired().catch((e) => console.warn('Moment cleanup failed:', e.message));
  setInterval(() => cleanupExpired().catch((e) => console.warn('Moment cleanup failed:', e.message)), CLEANUP_EVERY_MS).unref();
}

module.exports = { audienceIds, serializeMoment, startMomentCleanup, MOMENT_TTL_MS };
