const router = require('express').Router();
const mongoose = require('mongoose');
const Community = require('../models/Community');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const { emitToUser } = require('../realtime');
const { removeMember } = require('./groups');

function shapeCommunity(com, me) {
  const meId = String(me._id);
  const groups = (com.groups || []).filter((g) => g && g._id);
  return {
    _id: com._id,
    name: com.name,
    description: com.description,
    avatar: com.avatar,
    owner: com.owner && com.owner.toPublic ? com.owner.toPublic() : com.owner,
    admins: (com.admins || []).map(String),
    memberCount: (com.members || []).length,
    isMember: (com.members || []).some((m) => String(m._id || m) === meId),
    isAdmin: (com.admins || []).some((a) => String(a._id || a) === meId),
    isOwner: String(com.owner && (com.owner._id || com.owner)) === meId,
    groups: groups.map((g) => ({
      _id: g._id,
      name: g.name,
      avatar: g.avatar,
      memberCount: (g.participants || []).length,
      isMember: (g.participants || []).some((p) => String(p._id || p) === meId),
      isAdmin: (g.admins || []).some((a) => String(a._id || a) === meId),
    })),
    createdAt: com.createdAt,
  };
}

async function loadCommunity(req, res, { adminOnly = false } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: 'Community not found' });
    return null;
  }
  const com = await Community.findById(req.params.id).populate('owner').populate('groups');
  if (!com) {
    res.status(404).json({ message: 'Community not found' });
    return null;
  }
  if (adminOnly && !(com.admins || []).some((a) => String(a) === String(req.user._id))) {
    res.status(403).json({ message: 'Only community admins can do this' });
    return null;
  }
  return com;
}

/** Adds a user to every linked group (new members see no older history). */
async function addToGroups(com, userId) {
  const now = new Date();
  const groups = await Conversation.find({ _id: { $in: com.groups || [] }, isGroup: true });
  for (const g of groups) {
    if (!g.participants.some((p) => String(p) === String(userId))) {
      g.participants.push(userId);
      g.clearedAt.set(String(userId), now);
      await g.save();
      g.participants.forEach((p) => emitToUser(p, 'group:updated', { conversationId: String(g._id) }));
    }
  }
}

async function removeFromGroups(com, userId) {
  const groups = await Conversation.find({ _id: { $in: com.groups || [] }, isGroup: true });
  for (const g of groups) {
    if (g.participants.some((p) => String(p) === String(userId))) {
      await removeMember(g, userId);
      g.participants.forEach((p) => emitToUser(p, 'group:updated', { conversationId: String(g._id) }));
    }
  }
}

// GET /api/communities -> all communities (discoverable)
router.get('/', async (req, res) => {
  const list = await Community.find({}).populate('owner').populate('groups').sort({ createdAt: -1 });
  const shaped = list.map((c) => shapeCommunity(c, req.user));
  shaped.sort((a, b) => (b.isMember ? 1 : 0) - (a.isMember ? 1 : 0));
  res.json({ communities: shaped });
});

// POST /api/communities { name, description?, groupIds? } — groupIds must be groups I admin
router.post('/', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ message: 'Enter a community name' });
  let groupIds = [];
  if (Array.isArray(req.body.groupIds) && req.body.groupIds.length) {
    const clean = req.body.groupIds.filter((id) => mongoose.isValidObjectId(id));
    const groups = await Conversation.find({ _id: { $in: clean }, isGroup: true, admins: req.user._id });
    groupIds = groups.map((g) => g._id);
  }
  const com = await Community.create({
    name,
    description: String(req.body.description || '').trim().slice(0, 500),
    owner: req.user._id,
    admins: [req.user._id],
    members: [req.user._id],
    groups: groupIds,
  });
  await com.populate('owner');
  await com.populate('groups');
  res.status(201).json({ community: shapeCommunity(com, req.user) });
});

// GET /api/communities/:id -> detail incl. members
router.get('/:id', async (req, res) => {
  const com = await loadCommunity(req, res);
  if (!com) return;
  const members = await User.find({ _id: { $in: com.members || [] } });
  res.json({ community: shapeCommunity(com, req.user), members: members.map((u) => u.toPublic()) });
});

// POST /api/communities/:id/join -> join community + all its groups
router.post('/:id/join', async (req, res) => {
  const com = await loadCommunity(req, res);
  if (!com) return;
  const me = String(req.user._id);
  if (!(com.members || []).some((m) => String(m) === me)) {
    com.members.push(req.user._id);
    await com.save();
    await addToGroups(com, req.user._id);
  }
  await com.populate('owner');
  await com.populate('groups');
  res.json({ community: shapeCommunity(com, req.user) });
});

// POST /api/communities/:id/leave -> leave community + its groups
router.post('/:id/leave', async (req, res) => {
  const com = await loadCommunity(req, res);
  if (!com) return;
  const me = String(req.user._id);
  await removeFromGroups(com, req.user._id);
  com.members = (com.members || []).filter((m) => String(m) !== me);
  com.admins = (com.admins || []).filter((a) => String(a) !== me);
  if (!com.members.length) {
    await com.deleteOne();
    return res.json({ ok: true, deleted: true });
  }
  if (!com.admins.length) com.admins = [com.members[0]];
  if (String(com.owner._id || com.owner) === me) com.owner = com.members[0];
  await com.save();
  await com.populate('owner');
  await com.populate('groups');
  res.json({ community: shapeCommunity(com, req.user) });
});

// POST /api/communities/:id/groups { groupId } (community admin + group admin)
router.post('/:id/groups', async (req, res) => {
  const com = await loadCommunity(req, res, { adminOnly: true });
  if (!com) return;
  if (!mongoose.isValidObjectId(req.body.groupId)) return res.status(400).json({ message: 'Invalid group' });
  const g = await Conversation.findOne({ _id: req.body.groupId, isGroup: true, admins: req.user._id });
  if (!g) return res.status(403).json({ message: 'You must be an admin of that group to add it' });
  if (!(com.groups || []).some((id) => String(id) === String(g._id))) {
    com.groups.push(g._id);
    await com.save();
    // Existing community members join the newly added group too
    for (const memberId of com.members || []) await addToGroups({ groups: [g._id] }, memberId);
  }
  await com.populate('owner');
  await com.populate('groups');
  res.json({ community: shapeCommunity(com, req.user) });
});

// DELETE /api/communities/:id/groups/:groupId (community admins; the group itself stays)
router.delete('/:id/groups/:groupId', async (req, res) => {
  const com = await loadCommunity(req, res, { adminOnly: true });
  if (!com) return;
  com.groups = (com.groups || []).filter((id) => String(id) !== String(req.params.groupId));
  await com.save();
  await com.populate('owner');
  await com.populate('groups');
  res.json({ community: shapeCommunity(com, req.user) });
});

// POST /api/communities/:id/members { userIds: [] } (admins; also added to groups)
router.post('/:id/members', async (req, res) => {
  const com = await loadCommunity(req, res, { adminOnly: true });
  if (!com) return;
  const clean = [...new Set((Array.isArray(req.body.userIds) ? req.body.userIds : []).map(String))].filter(
    (id) => mongoose.isValidObjectId(id) && id !== String(req.user._id)
  );
  const users = await User.find({ _id: { $in: clean }, isBot: false, isDeleted: { $ne: true }, name: { $ne: '' } });
  for (const u of users) {
    if (!(com.members || []).some((m) => String(m) === String(u._id))) {
      com.members.push(u._id);
      await addToGroups(com, u._id);
    }
  }
  await com.save();
  await com.populate('owner');
  await com.populate('groups');
  res.json({ community: shapeCommunity(com, req.user) });
});

// DELETE /api/communities/:id/members/:userId (admins; also removed from groups)
router.delete('/:id/members/:userId', async (req, res) => {
  const com = await loadCommunity(req, res, { adminOnly: true });
  if (!com) return;
  await removeFromGroups(com, req.params.userId);
  com.members = (com.members || []).filter((m) => String(m) !== String(req.params.userId));
  com.admins = (com.admins || []).filter((a) => String(a) !== String(req.params.userId));
  if (!com.admins.length && com.members.length) com.admins = [com.members[0]];
  await com.save();
  await com.populate('owner');
  await com.populate('groups');
  res.json({ community: shapeCommunity(com, req.user) });
});

// POST /api/communities/:id/admins/:userId (admins)
router.post('/:id/admins/:userId', async (req, res) => {
  const com = await loadCommunity(req, res, { adminOnly: true });
  if (!com) return;
  if (!(com.members || []).some((m) => String(m) === String(req.params.userId))) {
    return res.status(400).json({ message: 'Only a member can become an admin' });
  }
  if (!(com.admins || []).some((a) => String(a) === String(req.params.userId))) {
    com.admins.push(req.params.userId);
    await com.save();
  }
  await com.populate('owner');
  await com.populate('groups');
  res.json({ community: shapeCommunity(com, req.user) });
});

// DELETE /api/communities/:id/admins/:userId (admins, at least one stays)
router.delete('/:id/admins/:userId', async (req, res) => {
  const com = await loadCommunity(req, res, { adminOnly: true });
  if (!com) return;
  const remaining = (com.admins || []).filter((a) => String(a) !== String(req.params.userId));
  if (!remaining.length) return res.status(400).json({ message: 'A community needs at least one admin' });
  com.admins = remaining;
  await com.save();
  await com.populate('owner');
  await com.populate('groups');
  res.json({ community: shapeCommunity(com, req.user) });
});

// DELETE /api/communities/:id (owner only; groups stay)
router.delete('/:id', async (req, res) => {
  const com = await loadCommunity(req, res);
  if (!com) return;
  if (String(com.owner._id || com.owner) !== String(req.user._id)) return res.status(403).json({ message: 'Only the community owner can delete it' });
  await com.deleteOne();
  res.json({ ok: true });
});

module.exports = router;
module.exports.addToGroups = addToGroups;