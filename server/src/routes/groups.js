const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { singleFile } = require('../middleware/upload');
const { uploadBuffer, destroy } = require('../services/storage');
const { createGroupMessage } = require('../services/messages');
const { shapeConversation, unreadCounts } = require('../services/conversations');
const { emitToUser } = require('../realtime');

const MAX_MEMBERS = 256;

const nameOf = (u) => (u && (u.name || u.phone)) || 'Someone';
const listNames = (users) => {
  const names = users.map(nameOf);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

async function loadGroup(req, res, { adminOnly = false } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: 'Group not found' });
    return null;
  }
  const conv = await Conversation.findOne({ _id: req.params.id, isGroup: true, participants: req.user._id });
  if (!conv) {
    res.status(404).json({ message: 'Group not found' });
    return null;
  }
  if (adminOnly && !(conv.admins || []).some((id) => String(id) === String(req.user._id))) {
    res.status(403).json({ message: 'Only group admins can do this' });
    return null;
  }
  return conv;
}

/** Tells every member (plus anyone removed) to refresh the group. */
function notifyMembers(conv, extraIds = []) {
  const ids = new Set([...conv.participants.map((p) => String(p._id || p)), ...extraIds.map(String)]);
  ids.forEach((id) => emitToUser(id, 'group:updated', { conversationId: String(conv._id) }));
}

async function respond(conv, req, res, status = 200) {
  const fresh = await Conversation.findById(conv._id).populate('participants').populate('lastMessage');
  res.status(status).json({ conversation: await shapeConversation(fresh, req.user, await unreadCounts(req.user._id)) });
}

/** Valid, existing, non-bot users from a list of ids (excluding me). */
async function realUsers(ids, me) {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter(
    (id) => mongoose.isValidObjectId(id) && id !== String(me._id)
  );
  if (!clean.length) return [];
  return User.find({ _id: { $in: clean }, isBot: false, isDeleted: { $ne: true }, name: { $ne: '' } });
}

// POST /api/groups { name, description?, memberIds: [] }
router.post('/', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ message: 'Enter a group name' });
  const members = await realUsers(req.body.memberIds, req.user);
  if (!members.length) return res.status(400).json({ message: 'Add at least one member' });
  if (members.length + 1 > MAX_MEMBERS) return res.status(400).json({ message: `A group can have up to ${MAX_MEMBERS} members` });

  const conv = await Conversation.create({
    isGroup: true,
    pairKey: `group_${crypto.randomBytes(12).toString('hex')}`,
    name,
    description: String(req.body.description || '').trim().slice(0, 500),
    participants: [req.user._id, ...members.map((m) => m._id)],
    admins: [req.user._id],
    createdBy: req.user._id,
    lastMessageAt: new Date(),
  });

  await createGroupMessage({ conversation: conv, sender: req.user, system: true, text: `${nameOf(req.user)} created the group "${name}"` });
  await createGroupMessage({ conversation: conv, sender: req.user, system: true, text: `${nameOf(req.user)} added ${listNames(members)}` });
  notifyMembers(conv);
  await respond(conv, req, res, 201);
});

// PATCH /api/groups/:id { name?, description? } (admins)
router.patch('/:id', async (req, res) => {
  const conv = await loadGroup(req, res, { adminOnly: true });
  if (!conv) return;
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim().slice(0, 60);
    if (!name) return res.status(400).json({ message: 'Group name cannot be empty' });
    if (name !== conv.name) {
      conv.name = name;
      await conv.save();
      await createGroupMessage({ conversation: conv, sender: req.user, system: true, text: `${nameOf(req.user)} changed the group name to "${name}"` });
    }
  }
  if (req.body.onlyAdminsCanSend !== undefined) {
    const next = Boolean(req.body.onlyAdminsCanSend);
    if (next !== Boolean(conv.onlyAdminsCanSend)) {
      conv.onlyAdminsCanSend = next;
      await conv.save();
      await createGroupMessage({
        conversation: conv,
        sender: req.user,
        system: true,
        text: next
          ? `${nameOf(req.user)} turned on "Only admins can send messages"`
          : `${nameOf(req.user)} turned off "Only admins can send messages"`,
      });
    }
  }
  if (req.body.description !== undefined) {
    const description = String(req.body.description).trim().slice(0, 500);
    if (description !== conv.description) {
      conv.description = description;
      await conv.save();
      await createGroupMessage({ conversation: conv, sender: req.user, system: true, text: `${nameOf(req.user)} changed the group description` });
    }
  }
  notifyMembers(conv);
  await respond(conv, req, res);
});

// POST /api/groups/:id/avatar (multipart "file", admins)
router.post('/:id/avatar', singleFile('file'), async (req, res) => {
  const conv = await loadGroup(req, res, { adminOnly: true });
  if (!conv) return;
  if (!req.file || !req.file.mimetype.startsWith('image/')) return res.status(400).json({ message: 'Choose an image' });
  let media;
  try {
    media = await uploadBuffer(req.file.buffer, { mimeType: req.file.mimetype, originalName: req.file.originalname, folder: 'chatly/groups' });
  } catch (err) {
    return res.status(502).json({ message: `Upload failed: ${err.message || 'storage error'}` });
  }
  const oldId = conv.avatarPublicId;
  conv.avatar = media.url;
  conv.avatarPublicId = media.publicId;
  await conv.save();
  if (oldId) destroy(oldId, 'image');
  await createGroupMessage({ conversation: conv, sender: req.user, system: true, text: `${nameOf(req.user)} changed the group photo` });
  notifyMembers(conv);
  await respond(conv, req, res);
});

// DELETE /api/groups/:id/avatar (admins)
router.delete('/:id/avatar', async (req, res) => {
  const conv = await loadGroup(req, res, { adminOnly: true });
  if (!conv) return;
  if (conv.avatarPublicId) destroy(conv.avatarPublicId, 'image');
  conv.avatar = '';
  conv.avatarPublicId = '';
  await conv.save();
  await createGroupMessage({ conversation: conv, sender: req.user, system: true, text: `${nameOf(req.user)} removed the group photo` });
  notifyMembers(conv);
  await respond(conv, req, res);
});

// POST /api/groups/:id/members { userIds: [] } (admins)
router.post('/:id/members', async (req, res) => {
  const conv = await loadGroup(req, res, { adminOnly: true });
  if (!conv) return;
  const existing = conv.participants.map(String);
  const users = (await realUsers(req.body.userIds, req.user)).filter((u) => !existing.includes(String(u._id)));
  if (!users.length) return res.status(400).json({ message: 'Choose people who are not in the group yet' });
  if (existing.length + users.length > MAX_MEMBERS) return res.status(400).json({ message: `A group can have up to ${MAX_MEMBERS} members` });

  const now = new Date();
  users.forEach((u) => {
    conv.participants.push(u._id);
    conv.clearedAt.set(String(u._id), now); // new members don't see older messages
  });
  await conv.save();
  await createGroupMessage({ conversation: conv, sender: req.user, system: true, text: `${nameOf(req.user)} added ${listNames(users)}` });
  notifyMembers(conv);
  await respond(conv, req, res);
});

/** Removes a member; promotes the longest-standing member when the last admin leaves. */
async function removeMember(conv, userId) {
  conv.participants = conv.participants.filter((p) => String(p) !== String(userId));
  conv.admins = (conv.admins || []).filter((a) => String(a) !== String(userId));
  if (!conv.admins.length && conv.participants.length) conv.admins = [conv.participants[0]];
  conv.clearedAt.delete(String(userId));
  await conv.save();
}

// DELETE /api/groups/:id/members/:userId (admin removes someone, or anyone removes themselves = leave)
router.delete('/:id/members/:userId', async (req, res) => {
  const leaving = String(req.params.userId) === String(req.user._id);
  const conv = await loadGroup(req, res, { adminOnly: !leaving });
  if (!conv) return;
  const target = await User.findById(req.params.userId).select('_id name phone');
  if (!target || !conv.participants.some((p) => String(p) === String(target._id))) {
    return res.status(404).json({ message: 'This person is not in the group' });
  }

  await removeMember(conv, target._id);
  emitToUser(target._id, 'group:removed', { conversationId: String(conv._id), left: leaving });

  if (!conv.participants.length) {
    // Last person left: nothing more to show
    notifyMembers(conv, [target._id]);
    return res.json({ ok: true, left: true });
  }

  await createGroupMessage({
    conversation: conv,
    sender: req.user,
    system: true,
    text: leaving ? `${nameOf(req.user)} left` : `${nameOf(req.user)} removed ${nameOf(target)}`,
  });
  notifyMembers(conv);
  if (leaving) return res.json({ ok: true, left: true });
  await respond(conv, req, res);
});

// POST /api/groups/:id/admins/:userId -> make admin (admins)
router.post('/:id/admins/:userId', async (req, res) => {
  const conv = await loadGroup(req, res, { adminOnly: true });
  if (!conv) return;
  if (!conv.participants.some((p) => String(p) === String(req.params.userId))) {
    return res.status(404).json({ message: 'This person is not in the group' });
  }
  if (!conv.admins.some((a) => String(a) === String(req.params.userId))) {
    conv.admins.push(req.params.userId);
    await conv.save();
  }
  notifyMembers(conv);
  await respond(conv, req, res);
});

// DELETE /api/groups/:id/admins/:userId -> dismiss as admin (admins)
router.delete('/:id/admins/:userId', async (req, res) => {
  const conv = await loadGroup(req, res, { adminOnly: true });
  if (!conv) return;
  const remaining = conv.admins.filter((a) => String(a) !== String(req.params.userId));
  if (!remaining.length) return res.status(400).json({ message: 'A group needs at least one admin' });
  conv.admins = remaining;
  await conv.save();
  notifyMembers(conv);
  await respond(conv, req, res);
});

module.exports = { router, removeMember };
